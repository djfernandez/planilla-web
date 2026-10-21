const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

async function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: 'Se requiere autenticación.' });
  }

  try {
    const token = await getAuth().verifyIdToken(match[1]);
    const userSnapshot = await getFirestore().collection('users').doc(token.uid).get();
    if (!userSnapshot.exists) {
      return res.status(403).json({ error: 'No se encontró el perfil de usuario.' });
    }

    req.identity = token;
    req.profile = { id: token.uid, uid: token.uid, email: token.email || '', ...userSnapshot.data() };
    next();
  } catch (error) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired' ||
        error.code === 'auth/id-token-revoked' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'La sesión no es válida. Inicia sesión nuevamente.' });
    }
    next(error);
  }
}

function requireActive(req, res, next) {
  if (req.profile.activo === false) {
    return res.status(403).json({ error: 'La cuenta está desactivada.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.profile.rol !== 'ADMIN') {
    return res.status(403).json({ error: 'Esta operación requiere permisos de administrador.' });
  }
  next();
}

module.exports = { authenticate, requireActive, requireAdmin };
