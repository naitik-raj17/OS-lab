const express = require('express');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure C program is compiled
const sjfExecutable = path.join(__dirname, process.platform === 'win32' ? 'sjf.exe' : 'sjf');
const sjfSource = path.join(__dirname, 'sjf.c');

// Compile C program if executable doesn't exist
function compileCProgram() {
  if (fs.existsSync(sjfExecutable)) {
    return Promise.resolve();
  }
  
  console.log('Compiling C program...');
  const compileCmd = process.platform === 'win32' 
    ? `gcc "${sjfSource}" -o "${sjfExecutable}"`
    : `gcc "${sjfSource}" -o "${sjfExecutable}"`;
  
  return new Promise((resolve, reject) => {
    exec(compileCmd, (error, stdout, stderr) => {
      if (error) {
        console.error('Failed to compile C program:', error);
        console.error('stderr:', stderr);
        reject(error);
      } else {
        console.log('C program compiled successfully');
        resolve();
      }
    });
  });
}

// Try to compile on startup
compileCProgram().catch(() => {
  console.warn('C program will be compiled on first request');
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/simulate', async (req, res) => {
  const { processes } = req.body;
  
  if (!processes || !Array.isArray(processes) || processes.length === 0) {
    return res.status(400).json({ error: 'Invalid processes data' });
  }

  // Ensure executable exists (compile if needed)
  if (!fs.existsSync(sjfExecutable)) {
    try {
      await compileCProgram();
    } catch (error) {
      return res.status(500).json({ 
        error: 'C program compilation failed. Please ensure gcc is installed and sjf.c exists.',
        details: error.message 
      });
    }
  }

  // Format input as JSON for C program
  const inputJson = JSON.stringify({ processes });
  
  // Execute C program using spawn for proper stdin/stdout handling
  const child = spawn(sjfExecutable, [], { shell: true });
  
  let stdout = '';
  let stderr = '';
  let responseSent = false;

  // Helper function to send response only once
  const sendResponse = (statusCode, data) => {
    if (responseSent) return;
    responseSent = true;
    res.status(statusCode).json(data);
  };

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', (code) => {
    if (responseSent) return;
    
    if (code !== 0) {
      console.error('C program error:', stderr);
      sendResponse(500, { error: 'Simulation failed', details: stderr });
      return;
    }

    if (!stdout || stdout.trim().length === 0) {
      console.error('C program produced no output');
      sendResponse(500, { error: 'Simulation produced no output', details: 'C program completed but returned no data' });
      return;
    }

    try {
      const result = JSON.parse(stdout);
      sendResponse(200, result);
    } catch (parseError) {
      console.error('Failed to parse C program output:', stdout);
      console.error('Parse error:', parseError.message);
      sendResponse(500, { error: 'Failed to parse simulation results', details: stdout.substring(0, 500) });
    }
  });

  child.on('error', (error) => {
    if (responseSent) return;
    console.error('Failed to start C program:', error);
    sendResponse(500, { error: 'Failed to execute simulation', details: error.message });
  });

  // Send input to C program
  try {
    child.stdin.write(inputJson, 'utf8');
    child.stdin.end();
  } catch (writeError) {
    if (responseSent) return;
    console.error('Failed to write to C program stdin:', writeError);
    sendResponse(500, { error: 'Failed to send input to simulation', details: writeError.message });
  }
});

app.listen(PORT, () => {
  console.log(`CPU Scheduling Simulator running at http://localhost:${PORT}`);
  console.log('Make sure gcc is installed to compile the C program');
});

