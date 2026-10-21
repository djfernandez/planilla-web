const { initializeApp } = require('firebase-admin/app');
const { onRequest } = require('firebase-functions/v2/https');

initializeApp();

const app = require('./app');

exports.api = onRequest({ maxInstances: 10 }, app);

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`API Express escuchando en http://localhost:${port}`));
}
