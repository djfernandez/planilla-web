const { db, serialize } = require('../models/firestore');

async function getProfile(req, res) {
  const snapshot = await db().collection('users').doc(req.identity.uid).get();
  if (!snapshot.exists) return res.status(404).json({ error: 'No se encontró el perfil.' });
  res.json({ data: { id: snapshot.id, uid: snapshot.id, email: req.identity.email || '', ...serialize(snapshot.data()) } });
}

module.exports = { getProfile };
