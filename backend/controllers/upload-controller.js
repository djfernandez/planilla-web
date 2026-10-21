const { randomUUID } = require('node:crypto');
const { getStorage } = require('firebase-admin/storage');
const { db } = require('../models/firestore');
const { serieFromProfile } = require('../models/planilla');

async function uploadFile(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo.' });
  const { kind, key } = req.body;
  const uid = req.identity.uid;
  const isAdmin = req.profile.rol === 'ADMIN';
  let path;

  if (kind === 'planilla' || kind === 'consentimiento') {
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Solo se permiten archivos PDF para este tipo de documento.' });
    }
    if (kind === 'planilla') {
      const expectedSerie = serieFromProfile(req.profile);
      const expectedFilename = `${expectedSerie}-${String((await getCounter(req.profile)) + 1).padStart(5, '0')}.pdf`;
      if (typeof key !== 'string' || key !== expectedFilename) {
        return res.status(409).json({ error: 'La numeración cambió. Actualiza la página e intenta nuevamente.' });
      }
      path = `planillas/${uid}/${safeSegment(key.replace(/\.pdf$/i, ''))}_${randomUUID()}.pdf`;
    } else {
      path = `consentimientos/${uid}/declaracion_jurada.pdf`;
    }
  } else if (kind === 'comprobante' && isAdmin) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,80}-\d{1,10}$/.test(key)) {
      return res.status(400).json({ error: 'Identificador de planilla no válido.' });
    }
    const [serie, num] = key.split(/-(?=\d+$)/);
    const matches = (await db().collection('history').where('serie', '==', serie).get())
      .docs.filter(document => String(document.get('num')) === num);
    if (matches.length === 0 || matches.some(document => document.get('pagado') !== true) ||
        matches.some(document => document.get('userId') !== matches[0].get('userId'))) {
      return res.status(403).json({ error: 'Solo se pueden adjuntar comprobantes a planillas pagadas.' });
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Los comprobantes deben ser PDF, JPG o PNG.' });
    }
    path = `comprobantes/${matches[0].get('userId')}/${safeSegment(key)}/${Date.now()}_${randomUUID()}_${safeSegment(req.file.originalname)}`;
  } else {
    return res.status(403).json({ error: 'No tienes permisos para subir este tipo de archivo.' });
  }

  const bucket = getStorage().bucket();
  const downloadToken = randomUUID();
  const object = bucket.file(path);
  await object.save(req.file.buffer, {
    resumable: false,
    metadata: {
      contentType: req.file.mimetype,
      metadata: { firebaseStorageDownloadTokens: downloadToken }
    }
  });

  const encodedPath = encodeURIComponent(path);
  const bucketName = bucket.name;
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
  res.status(201).json({ data: { path, url, name: req.file.originalname } });
}

function safeSegment(value) {
  if (typeof value !== 'string' || !value || value.includes('/') || value.includes('\\') || value.includes('..')) {
    const error = new Error('Nombre de archivo no válido.');
    error.status = 400;
    throw error;
  }
  return value.replace(/[^\w.\- ]+/g, '_').slice(0, 160);
}

async function getCounter(profile) {
  const snapshot = await db().collection('counters').doc(String(profile.dni || '')).get();
  return snapshot.exists ? Number(snapshot.get('count') || 0) : 0;
}

module.exports = { uploadFile };
