function requireObjectBody(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un objeto JSON no vacío.' });
  }
  next();
}

module.exports = { requireObjectBody };
