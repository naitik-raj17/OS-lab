const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CPU Scheduling Simulator running at http://localhost:${PORT}`);
});

