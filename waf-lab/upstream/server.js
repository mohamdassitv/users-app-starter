/**
 * Multi-Tenant Upstream Application
 * ==================================
 * This application simulates a multi-tenant backend that serves different
 * deployments based on the Host header received in the request.
 * 
 * Expected Host header: bayer.quanthealth.ai
 * Any other Host header will result in DEPLOYMENT_NOT_FOUND error
 */

const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const EXPECTED_HOST = process.env.EXPECTED_HOST || 'bayer.quanthealth.ai';

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} | Host: ${req.headers.host || 'MISSING'}`);
  next();
});

// Main application route
app.get('/', (req, res) => {
  const receivedHost = req.headers.host;
  
  // Check if the Host header matches the expected deployment
  if (receivedHost === EXPECTED_HOST) {
    // Success - Return the application page
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bayer QuantHealth Portal</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            background: rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
          }
          h1 {
            margin-top: 0;
            font-size: 36px;
          }
          .status {
            background: rgba(16, 185, 129, 0.3);
            padding: 12px 20px;
            border-radius: 6px;
            border-left: 4px solid #10b981;
            margin: 20px 0;
          }
          .info {
            font-size: 14px;
            opacity: 0.8;
            margin-top: 30px;
          }
          .success-icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Welcome to Bayer QuantHealth</h1>
          <div class="status">
            <strong>Status:</strong> Application is running successfully!
          </div>
          <p>
            This is the Bayer QuantHealth production portal. You have successfully
            accessed the application through the WAF reverse proxy.
          </p>
          <div class="info">
            <strong>Deployment:</strong> ${EXPECTED_HOST}<br>
            <strong>Received Host:</strong> ${receivedHost}<br>
            <strong>Status:</strong> ACTIVE ✓
          </div>
        </div>
      </body>
      </html>
    `);
    console.log(`✓ SUCCESS: Valid Host header received (${receivedHost})`);
  } else {
    // Error - Host header doesn't match any known deployment
    res.status(404).json({
      error: 'DEPLOYMENT_NOT_FOUND',
      message: `No deployment found for host: ${receivedHost}`,
      expected: EXPECTED_HOST,
      received: receivedHost,
      hint: 'Please check your WAF configuration and ensure the Host header is set correctly'
    });
    console.log(`✗ ERROR: Invalid Host header (received: ${receivedHost}, expected: ${EXPECTED_HOST})`);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'upstream-app',
    timestamp: new Date().toISOString(),
    expected_host: EXPECTED_HOST
  });
});

// 404 handler for other routes
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'The requested endpoint does not exist',
    path: req.path
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('Multi-Tenant Upstream Application');
  console.log('='.repeat(60));
  console.log(`Server running on port ${PORT}`);
  console.log(`Expected Host header: ${EXPECTED_HOST}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
});
