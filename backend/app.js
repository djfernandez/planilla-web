const express = require('express');
const apiRouter = require('./routes/api');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRouter);
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) ? error.status :
    error.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
  if (status >= 500) console.error('Error en API:', error);
  res.status(status).json({
    error: status === 413 ? 'El archivo supera el límite de 15 MB.' :
      status >= 500 ? 'Ocurrió un error interno. Inténtalo nuevamente.' : error.message
  });
});

module.exports = app;
