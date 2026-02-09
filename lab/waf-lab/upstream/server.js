const express = require('express');
const app = express();

// Middleware to check Host header
app.use((req, res, next) => {
  const host = req.get('host');
  console.log(`[${new Date().toISOString()}] Request received - Host: ${host}`);
  
  // Only accept requests with correct Host header
  const validHosts = ['gt.maswebics.com', 'msy.maswebics.com'];
  if (!validHosts.includes(host)) {
    console.log(`[ERROR] Invalid Host header: ${host} (expected: ${validHosts.join(' or ')})`);
    return res.status(404).send('DEPLOYMENT_NOT_FOUND');
  }
  
  next();
});

app.get('/', (req, res) => {
  const host = req.get('host');
  const site = host === 'gt.maswebics.com' ? 'Guatemala' : 'Malaysia';
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>BMI Iguaias Médicas - Healthcare Portal</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
      color: white;
    }
    .container {
      background: rgba(255, 255, 255, 0.1);
      padding: 40px;
      border-radius: 10px;
      backdrop-filter: blur(10px);
    }
    h1 { margin: 0 0 10px; }
    .status { color: #10b981; font-weight: bold; }
    .badge { background: rgba(255,255,255,0.2); padding: 5px 12px; border-radius: 5px; font-size: 12px; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome to BMI Iguaias Médicas - Healthcare Portal</h1>
    <p><span class="badge">${site} Region</span></p>
    <p>Status: <span class="status">✓ OPERATIONAL</span></p>
    <p>This is the upstream application behind CloudGuard WAF.</p>
    <p>SR ID: 6-0004415727</p>
    <p>Component: Connectivity - Upstream</p>
    <p>Service Level: Premium</p>
  </div>
</body>
</html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = 80;
app.listen(PORT, () => {
  console.log(`BMI Iguaias Médicas upstream server running on port ${PORT}`);
  console.log(`Accepting traffic for Hosts: gt.maswebics.com, msy.maswebics.com`);
});
