const axios = require('axios');
const app = require('./app'); // Import app without starting it
const http = require('http');

const PORT = 5001; // Use different port for testing
let server;

const startServer = () => {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
  });
};

const stopServer = () => {
  if (server) {
    server.close(() => {
      console.log('Test server stopped');
    });
  }
};

async function runTests() {
  await startServer();
  const baseUrl = `http://localhost:${PORT}`;
  let passedCount = 0;
  let failedCount = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.response?.data || err.message);
      failedCount++;
    }
  }

  // Test 1: Health Check
  await test('GET /health', async () => {
    const res = await axios.get(`${baseUrl}/health`);
    if (!res.data.success || res.data.message !== 'Library Management System API is healthy') {
      throw new Error('Unexpected health check response');
    }
  });

  // Test 2: Generate Invoice PDF
  await test('POST /api/invoice/generate (Success)', async () => {
    const res = await axios.post(`${baseUrl}/api/invoice/generate`, {
      studentName: 'Rahul Kumar',
      amount: 450,
      seatNumber: 12,
      dueDate: '2026-08-20',
      batch: 'A Shift (6AM-10AM)',
    });

    if (!res.data.success || !res.data.pdfUrl.includes('/uploads/')) {
      throw new Error('Failed to generate PDF');
    }
    console.log(`       Generated Invoice URL: ${res.data.pdfUrl}`);
  });

  // Test 3: Generate Invoice Validation Error
  await test('POST /api/invoice/generate (Validation Fail - Missing Name)', async () => {
    try {
      await axios.post(`${baseUrl}/api/invoice/generate`, {
        amount: 450,
      });
      throw new Error('Should have failed validation');
    } catch (err) {
      if (err.response?.status !== 400 || err.response?.data?.error !== 'Student name is required.') {
        throw new Error(`Unexpected error: ${err.message}`);
      }
    }
  });

  // Test 4: Send Text Message Validation Error
  await test('POST /api/whatsapp/send (Validation Fail - Missing message)', async () => {
    try {
      await axios.post(`${baseUrl}/api/whatsapp/send`, {
        phone: '919876543210',
      });
      throw new Error('Should have failed validation');
    } catch (err) {
      if (err.response?.status !== 400 || err.response?.data?.error !== 'Message content cannot be empty.') {
        throw new Error(`Unexpected error: ${err.message}`);
      }
    }
  });

  // Test 5: Send Text Message Client Status check (expecting uninitialized client error)
  await test('POST /api/whatsapp/send (Client not ready check)', async () => {
    try {
      await axios.post(`${baseUrl}/api/whatsapp/send`, {
        phone: '919876543210',
        message: 'Hello World',
      });
      throw new Error('Should have failed since WhatsApp client is not authenticated');
    } catch (err) {
      if (err.response?.status === 400) {
        throw new Error(`Bad request validation: ${err.message}`);
      }
      const errMsg = err.response?.data?.error || err.message;
      if (!errMsg.includes('WhatsApp client is not ready')) {
        throw new Error(`Unexpected error message: ${errMsg}`);
      }
      console.log(`       Caught expected error: ${errMsg}`);
    }
  });

  console.log('\n--- Test Summary ---');
  console.log(`Total Passed: ${passedCount}`);
  console.log(`Total Failed: ${failedCount}`);

  stopServer();
  
  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
