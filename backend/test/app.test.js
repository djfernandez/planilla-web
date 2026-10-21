const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const app = require('../app');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('health endpoint reports a healthy API', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('protected API rejects requests without a bearer token', async () => {
  const response = await fetch(`${baseUrl}/api/me`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Se requiere autenticación.' });
});

test('unknown endpoints return a JSON 404', async () => {
  const response = await fetch(`${baseUrl}/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Ruta no encontrada.' });
});
