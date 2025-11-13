const processForm = document.getElementById('process-form');
const arrivalInput = document.getElementById('arrival-time');
const burstInput = document.getElementById('burst-time');
const processTableBody = document.querySelector('#process-table tbody');
const simulateBtn = document.getElementById('simulate-btn');
const resetBtn = document.getElementById('reset-btn');
const metricsCard = document.getElementById('metrics');
const avgWaitingNode = document.getElementById('avg-waiting-time');
const avgTurnaroundNode = document.getElementById('avg-turnaround-time');
const cpuUtilizationNode = document.getElementById('cpu-utilization');
const detailsCard = document.getElementById('details');
const detailsTableBody = detailsCard.querySelector('tbody');
const ganttCard = document.getElementById('gantt-chart');
const chartTimeline = document.getElementById('chart-timeline');
const chartLabels = document.getElementById('chart-labels');

let processes = [];
let pidCounter = 1;

const colorPalette = ['#850e35', '#ee6983', '#ffc4c4', '#fcf5ee', 'rgb(133, 14, 53)', 'rgb(238, 105, 131)', 'rgb(255, 196, 196)', 'rgb(252, 245, 238)'];

function colorToRgb(color) {
  if (!color || typeof color !== 'string') {
    return { r: 255, g: 255, b: 255 };
  }

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const normalized = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
    const intVal = parseInt(normalized, 16);
    return {
      r: (intVal >> 16) & 255,
      g: (intVal >> 8) & 255,
      b: intVal & 255
    };
  }

  const rgbMatch = color
    .replace(/\s+/g, '')
    .match(/^rgb(a)?\((\d{1,3}),(\d{1,3}),(\d{1,3})(?:,(0|0?\.\d+|1))?\)$/i);

  if (rgbMatch) {
    return {
      r: Number(rgbMatch[2]),
      g: Number(rgbMatch[3]),
      b: Number(rgbMatch[4])
    };
  }

  return { r: 255, g: 255, b: 255 };
}

function isLightColor(color) {
  const { r, g, b } = colorToRgb(color);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 180;
}

processForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const arrival = Number(arrivalInput.value);
  const burst = Number(burstInput.value);

  if (Number.isNaN(arrival) || Number.isNaN(burst) || burst <= 0) {
    alert('Please enter valid non-negative arrival time and positive burst time.');
    return;
  }

  const newProcess = {
    pid: `P${pidCounter}`,
    arrivalTime: arrival,
    burstTime: burst
  };

  processes.push(newProcess);
  pidCounter += 1;
  renderProcessTable();
  processForm.reset();
  arrivalInput.focus();
});

resetBtn.addEventListener('click', () => {
  processes = [];
  pidCounter = 1;
  renderProcessTable();
  hideResults();
});

simulateBtn.addEventListener('click', async () => {
  if (processes.length === 0) {
    alert('Add at least one process before simulation.');
    return;
  }

  // Disable button during simulation
  simulateBtn.disabled = true;
  simulateBtn.textContent = 'Simulating...';

  try {
    // Format processes for API
    const processData = processes.map(p => ({
      pid: p.pid,
      arrival: p.arrivalTime,
      burst: p.burstTime
    }));

    const response = await fetch('/api/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ processes: processData })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Simulation failed');
    }

    const result = await response.json();
    
    // Transform C program output to match frontend format
    const transformedResult = {
      timeline: (result.timeline || []).map(slot => ({
        pid: slot.pid || 'UNKNOWN',
        start: slot.start || 0,
        end: slot.end || 0,
        color: pickColor(slot.pid)
      })),
      details: (result.details || []).map(d => ({
        pid: d.pid || 'UNKNOWN',
        startTime: d.startTime || 0,
        completionTime: d.completionTime || 0,
        waitingTime: d.waitingTime || 0,
        turnaroundTime: d.turnaroundTime || 0,
        arrivalTime: d.arrival || 0,
        burstTime: d.burst || 0
      })),
      avgWaitingTime: (result.avgWaitingTime || 0).toFixed(2),
      avgTurnaroundTime: (result.avgTurnaroundTime || 0).toFixed(2),
      cpuUtilization: (result.cpuUtilization || 0).toFixed(2)
    };

    renderResults(transformedResult);
  } catch (error) {
    console.error('Simulation error:', error);
    alert('Simulation failed: ' + error.message);
  } finally {
    simulateBtn.disabled = false;
    simulateBtn.textContent = 'Simulate';
  }
});

function renderProcessTable() {
  processTableBody.innerHTML = '';

  if (processes.length === 0) {
    const emptyRow = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.classList.add('empty-state');
    cell.textContent = 'No processes added yet.';
    emptyRow.append(cell);
    processTableBody.append(emptyRow);
    return;
  }

  const sorted = [...processes].sort((a, b) => a.arrivalTime - b.arrivalTime || a.pid.localeCompare(b.pid));
  sorted.forEach((proc) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${proc.pid}</td>
      <td>${proc.arrivalTime}</td>
      <td>${proc.burstTime}</td>
    `;
    processTableBody.append(row);
  });
}

function hideResults() {
  metricsCard.classList.add('hidden');
  detailsCard.classList.add('hidden');
  ganttCard.classList.add('hidden');
  chartTimeline.innerHTML = '';
  chartLabels.innerHTML = '';
  detailsTableBody.innerHTML = '';
}

/**
 * Run non-preemptive SJF scheduling.
 * @param {Array<{pid:string, arrivalTime:number, burstTime:number}>} procList
 */
function runSJF(procList) {
  const processesCopy = procList.map((p) => ({
    ...p,
    remainingTime: p.burstTime
  }));

  const timeline = [];
  const completed = new Map();
  let currentTime = Math.min(...processesCopy.map((p) => p.arrivalTime));
  let cpuBusyTime = 0;

  while (completed.size < processesCopy.length) {
    const available = processesCopy
      .filter((p) => p.arrivalTime <= currentTime && !completed.has(p.pid))
      .sort((a, b) => a.burstTime - b.burstTime || a.arrivalTime - b.arrivalTime || a.pid.localeCompare(b.pid));

    if (available.length === 0) {
      const nextArrival = Math.min(...processesCopy.filter((p) => !completed.has(p.pid)).map((p) => p.arrivalTime));
      timeline.push({
        pid: 'IDLE',
        start: currentTime,
        end: nextArrival,
        color: '#e7b8b8'
      });
      currentTime = nextArrival;
      continue;
    }

    const process = available[0];
    const start = currentTime;
    const end = start + process.burstTime;

    timeline.push({
      pid: process.pid,
      start,
      end,
      color: pickColor(process.pid)
    });

    completed.set(process.pid, {
      startTime: start,
      completionTime: end,
      waitingTime: start - process.arrivalTime,
      turnaroundTime: end - process.arrivalTime,
      burstTime: process.burstTime,
      arrivalTime: process.arrivalTime
    });

    cpuBusyTime += process.burstTime;
    currentTime = end;
  }

  const firstStart = Math.min(...timeline.map((slot) => slot.start));
  const finalEnd = Math.max(...timeline.map((slot) => slot.end));
  const cpuUtilization = ((cpuBusyTime / (finalEnd - firstStart || 1)) * 100).toFixed(2);

  const details = Array.from(completed.entries()).map(([pid, info]) => ({
    pid,
    ...info
  }));

  const avgWaitingTime = (details.reduce((sum, p) => sum + p.waitingTime, 0) / details.length).toFixed(2);
  const avgTurnaroundTime = (details.reduce((sum, p) => sum + p.turnaroundTime, 0) / details.length).toFixed(2);

  return {
    timeline,
    details,
    avgWaitingTime,
    avgTurnaroundTime,
    cpuUtilization
  };
}

function pickColor(pid) {
  if (!pid || typeof pid !== 'string') {
    return colorPalette[0]; // Default to first color
  }
  
  // Handle "IDLE" process with a special color
  if (pid === 'IDLE') {
    return '#e7b8b8'; // Light gray for idle time
  }
  
  const index = Number(pid.replace(/\D+/g, '')) || 0;
  const paletteIndex = index > 0 ? (index - 1) % colorPalette.length : 0;
  return colorPalette[paletteIndex] || colorPalette[0];
}

function renderResults({ timeline, details, avgWaitingTime, avgTurnaroundTime, cpuUtilization }) {
  metricsCard.classList.remove('hidden');
  detailsCard.classList.remove('hidden');
  ganttCard.classList.remove('hidden');

  avgWaitingNode.textContent = `${avgWaitingTime} ms`;
  avgTurnaroundNode.textContent = `${avgTurnaroundTime} ms`;
  cpuUtilizationNode.textContent = `${cpuUtilization}%`;

  detailsTableBody.innerHTML = '';
  details
    .sort((a, b) => a.pid.localeCompare(b.pid))
    .forEach((proc) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${proc.pid}</td>
        <td>${proc.startTime}</td>
        <td>${proc.completionTime}</td>
        <td>${proc.waitingTime}</td>
        <td>${proc.turnaroundTime}</td>
      `;
      detailsTableBody.append(row);
    });

  chartTimeline.innerHTML = '';
  chartLabels.innerHTML = '';

  timeline.forEach((slot) => {
    const segment = document.createElement('div');
    segment.classList.add('chart-segment');
    segment.style.flex = slot.end - slot.start;
    segment.style.background = slot.color;
    segment.dataset.start = slot.start;
    segment.dataset.end = slot.end;
    const light = isLightColor(slot.color);
    segment.style.setProperty('--segment-text', light ? '#3f0a21' : '#fcf5ee');
    segment.style.setProperty('--tick-color', light ? 'rgba(63, 10, 33, 0.65)' : 'rgba(252, 245, 238, 0.85)');
    segment.innerHTML = `<span>${slot.pid}</span>`;
    chartTimeline.append(segment);
  });

  const scaleLabels = [...new Set(timeline.flatMap((slot) => [slot.start, slot.end]))].sort((a, b) => a - b);
  scaleLabels.forEach((tick) => {
    const label = document.createElement('div');
    label.textContent = tick;
    chartLabels.append(label);
  });
}

// Initialize table display
renderProcessTable();

