const http = require('http');
const app = require('../app');

async function testCors() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`=== TESTING CORS ON BACKEND (ephemeral port ${port}) ===\n`);

  async function makeRequest(path, method = 'GET', headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  // Test 1: GET /api/whatsapp/status from Vercel origin
  console.log('[Test 1] Testing GET /api/whatsapp/status from Vercel origin...');
  const res1 = await makeRequest('/api/whatsapp/status', 'GET', {
    Origin: 'https://bhagwat-library-free.vercel.app',
  });
  console.log('Status Code:', res1.status);
  console.log('Access-Control-Allow-Origin:', res1.headers['access-control-allow-origin']);
  console.log('Access-Control-Allow-Credentials:', res1.headers['access-control-allow-credentials']);

  // Test 2: OPTIONS /api/whatsapp/status (Preflight)
  console.log('\n[Test 2] Testing OPTIONS /api/whatsapp/status (Preflight)...');
  const res2 = await makeRequest('/api/whatsapp/status', 'OPTIONS', {
    Origin: 'https://bhagwat-library-free.vercel.app',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'content-type,authorization',
  });
  console.log('Status Code:', res2.status);
  console.log('Access-Control-Allow-Origin:', res2.headers['access-control-allow-origin']);
  console.log('Access-Control-Allow-Methods:', res2.headers['access-control-allow-methods']);
  console.log('Access-Control-Allow-Headers:', res2.headers['access-control-allow-headers']);

  // Test 3: OPTIONS /api/whatsapp/start (Preflight POST)
  console.log('\n[Test 3] Testing OPTIONS /api/whatsapp/start (Preflight POST)...');
  const res3 = await makeRequest('/api/whatsapp/start', 'OPTIONS', {
    Origin: 'https://bhagwat-library-free.vercel.app',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  });
  console.log('Status Code:', res3.status);
  console.log('Access-Control-Allow-Origin:', res3.headers['access-control-allow-origin']);
  console.log('Access-Control-Allow-Methods:', res3.headers['access-control-allow-methods']);

  // Test 4: Localhost origin test
  console.log('\n[Test 4] Testing GET /api/whatsapp/status from localhost:5174...');
  const res4 = await makeRequest('/api/whatsapp/status', 'GET', {
    Origin: 'http://localhost:5174',
  });
  console.log('Status Code:', res4.status);
  console.log('Access-Control-Allow-Origin:', res4.headers['access-control-allow-origin']);

  server.close();
  console.log('\n=== ALL CORS TESTS COMPLETE ===');
  process.exit(0);
}

testCors().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
