const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('../models/firestore');
const { serieFromProfile } = require('../models/planilla');
const { canUpdateHistory, canUpdateUser } = require('../models/authorization');

const MAX_DAILY_TOTAL = 45;

async function createPlanilla(req, res) {
  const { expectedCount, serie, fechaEmision, proyecto, pdfUrl, rows } = req.body;
  const user = req.profile;
  if (user.activo === false) return res.status(403).json({ error: 'La cuenta está desactivada.' });
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 50) {
    return res.status(400).json({ error: 'La planilla debe incluir entre 1 y 50 desplazamientos.' });
  }
  if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    return res.status(400).json({ error: 'Cada desplazamiento debe ser un objeto válido.' });
  }
  if (!Number.isInteger(expectedCount) || expectedCount < 0 || typeof serie !== 'string' ||
      !isValidDate(fechaEmision) || typeof proyecto !== 'string' || typeof pdfUrl !== 'string' ||
      typeof user.dni !== 'string' || !user.dni.trim()) {
    return res.status(400).json({ error: 'Los datos de la planilla no son válidos.' });
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(pdfUrl);
  } catch {
    return res.status(400).json({ error: 'La dirección del PDF no es válida.' });
  }
  if (parsedUrl.hostname !== 'firebasestorage.googleapis.com' || !parsedUrl.searchParams.get('token')) {
    return res.status(400).json({ error: 'La dirección del PDF no es válida.' });
  }
  let pdfObjectPath;
  try {
    pdfObjectPath = decodeURIComponent(parsedUrl.pathname.split('/o/')[1] || '');
  } catch {
    return res.status(400).json({ error: 'La dirección del PDF no es válida.' });
  }
  if (!pdfObjectPath.startsWith(`planillas/${req.identity.uid}/`)) {
    return res.status(400).json({ error: 'La dirección del PDF no corresponde a esta cuenta.' });
  }

  const cleanedRows = rows.map(row => ({
    destino: requiredText(row.destino, 250),
    motivo: requiredText(row.motivo, 500),
    pc: requiredText(row.pc, 100),
    monto: Number(row.monto)
  }));
  if (cleanedRows.some(row => !Number.isFinite(row.monto) || row.monto <= 0)) {
    return res.status(400).json({ error: 'Los montos deben ser mayores que cero.' });
  }
  if (cleanedRows.some(row => !/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision) &&
      !Number.isFinite(new Date(fechaEmision).getTime()))) {
    return res.status(400).json({ error: 'La fecha de emisión no es válida.' });
  }

  const total = cleanedRows.reduce((sum, row) => sum + row.monto, 0);
  if (total > MAX_DAILY_TOTAL) {
    return res.status(400).json({ error: 'La planilla supera el tope diario permitido.' });
  }

  const firestore = db();
  const counterRef = firestore.collection('counters').doc(String(user.dni || ''));
  const emissionDate = new Date(fechaEmision);
  const startOfDay = new Date(emissionDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(emissionDate);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const documentRefs = cleanedRows.map(() => firestore.collection('history').doc());
  const now = new Date();
  const num = expectedCount + 1;
  const numFormatted = String(num).padStart(5, '0');
  if (serie !== serieFromProfile(user) || !/^[A-Za-z0-9_-]{1,40}$/.test(serie) ||
      !pdfObjectPath.startsWith(`planillas/${req.identity.uid}/${serie}-${numFormatted}_`) ||
      !pdfObjectPath.endsWith('.pdf')) {
    return res.status(400).json({ error: 'La serie o el archivo PDF no corresponden al correlativo.' });
  }
  const areaSnapshot = user.areaId ? await firestore.collection('areas').doc(user.areaId).get() : null;
  const areaNombre = areaSnapshot?.exists ? areaSnapshot.get('nombre') || '' : '';

  await firestore.runTransaction(async transaction => {
    const counterSnapshot = await transaction.get(counterRef);
    const currentCount = counterSnapshot.exists ? Number(counterSnapshot.get('count') || 0) : 0;
    if (currentCount !== expectedCount) {
      const error = new Error('La numeración cambió. Actualiza la página e intenta nuevamente.');
      error.status = 409;
      throw error;
    }
    const sameDaySnapshot = await transaction.get(
      firestore.collection('history').where('userDNI', '==', user.dni));
    const affectedIds = new Set(sameDaySnapshot.docs.map(document => document.id));
    if (documentRefs.some(reference => affectedIds.has(reference.id))) {
      const error = new Error('Actualiza la página e intenta registrar nuevamente.');
      error.status = 409;
      throw error;
    }
    const accumulated = sameDaySnapshot.docs.reduce((sum, document) => {
      const value = document.get('fechaEmision');
      const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
      return date >= startOfDay && date <= endOfDay ? sum + Number(document.get('monto') || 0) : sum;
    }, 0);
    if (accumulated + total > MAX_DAILY_TOTAL) {
      const error = new Error('Los gastos registrados ya alcanzaron el tope diario.');
      error.status = 409;
      throw error;
    }

    transaction.set(counterRef, { count: num }, { merge: true });
    cleanedRows.forEach((row, index) => {
      transaction.set(documentRefs[index], {
        ...row,
        proyecto: proyecto.slice(0, 250),
        fechaEmision: new Date(fechaEmision),
        fechaRegistro: now,
        userId: req.identity.uid,
        areaId: user.areaId || null,
        userDNI: user.dni || '',
        userNombreCompleto: `${user.nombres || user.nombre || ''} ${user.apellidos || ''}`.trim(),
        serie,
        num: numFormatted,
        planillaKey: `${serie}-${numFormatted}`,
        areaNombre,
        pdfUrl,
        vbOk: false,
        pagado: false,
        comprobantes: []
      });
    });
  });

  res.status(201).json({ data: { serie, num: numFormatted, ids: documentRefs.map(ref => ref.id) } });
}

async function updateHistory(req, res) {
  const firestore = db();
  const reference = firestore.collection('history').doc(req.params.id);
  const snapshot = await reference.get();
  if (!snapshot.exists) return res.status(404).json({ error: 'Registro no encontrado.' });

  const existing = snapshot.data();
  const changes = req.body;
  const isAdmin = req.profile.rol === 'ADMIN';
  const isApprover = !isAdmin && await canApprove(existing.areaId, req.identity.uid);

  if (!canUpdateHistory(req.profile.rol, isApprover, changes)) {
    return res.status(403).json({ error: 'No tienes permisos para modificar este registro.' });
  }
  if (isAdmin && Object.hasOwn(changes, 'comprobantes') &&
      JSON.stringify(changes.comprobantes) !== JSON.stringify(existing.comprobantes) &&
      (changes.pagado ?? existing.pagado) !== true &&
      !(Array.isArray(changes.comprobantes) && changes.comprobantes.length === 0)) {
    return res.status(400).json({ error: 'No se pueden adjuntar comprobantes a una planilla no pagada.' });
  }

  await reference.update(applySentinels(changes));
  res.json({ data: { id: reference.id } });
}

async function updateHistoryGroup(req, res) {
  const { key } = req.params;
  if (!/^[A-Za-z0-9_-]{1,80}-\d{1,10}$/.test(key)) {
    return res.status(400).json({ error: 'Identificador de planilla no válido.' });
  }
  const [serie, num] = key.split(/-(?=\d+$)/);
  const matchingDocuments = (await db().collection('history').where('serie', '==', serie).get())
    .docs.filter(document => String(document.get('num')) === num);
  if (matchingDocuments.length === 0) return res.status(404).json({ error: 'Planilla no encontrada.' });
  if (matchingDocuments.length > 100) return res.status(400).json({ error: 'La planilla contiene demasiadas líneas.' });

  const changes = req.body;
  const isAdmin = req.profile.rol === 'ADMIN';
  const isApproverForAll = !isAdmin && await Promise.all(matchingDocuments.map(document =>
    canApprove(document.get('areaId'), req.identity.uid)));
  if (!canUpdateHistory(req.profile.rol, isApproverForAll.every(Boolean), changes)) {
    return res.status(403).json({ error: 'No tienes permisos para modificar esta planilla.' });
  }
  if (isAdmin && Object.hasOwn(changes, 'comprobantes') &&
      matchingDocuments.some(document => JSON.stringify(changes.comprobantes) !==
        JSON.stringify(document.get('comprobantes')) && (changes.pagado ?? document.get('pagado')) !== true &&
        !(Array.isArray(changes.comprobantes) && changes.comprobantes.length === 0))) {
    return res.status(400).json({ error: 'No se pueden adjuntar comprobantes a una planilla no pagada.' });
  }

  const batch = db().batch();
  matchingDocuments.forEach(document => batch.update(document.ref, applySentinels(changes)));
  await batch.commit();
  res.json({ data: { updated: matchingDocuments.length } });
}

async function deleteHistory(req, res) {
  if (req.profile.rol !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo un administrador puede eliminar registros.' });
  }
  await db().collection('history').doc(req.params.id).delete();
  res.status(204).end();
}

async function updateUser(req, res) {
  const { id } = req.params;
  const self = id === req.identity.uid;
  if (!canUpdateUser(req.profile.rol, self, req.body)) {
    return res.status(403).json({ error: 'No tienes permisos para modificar este perfil.' });
  }
  if (req.profile.activo === false) {
    return res.status(403).json({ error: 'La cuenta está desactivada.' });
  }
  const firestore = db();
  const targetRef = firestore.collection('users').doc(id);
  const adminQuery = firestore.collection('users').where('rol', '==', 'ADMIN');
  if (req.profile.rol === 'ADMIN') {
    if (self && req.body.activo === false) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    await firestore.runTransaction(async transaction => {
      const [target, administrators] = await Promise.all([
        transaction.get(targetRef),
        transaction.get(adminQuery)
      ]);
      if (!target.exists) {
        const error = new Error('Perfil de usuario no encontrado.');
        error.status = 404;
        throw error;
      }
      const updatedProfile = { ...target.data(), ...req.body };
      const activeAdmins = administrators.docs.filter(document => {
        const profile = document.id === id ? updatedProfile : document.data();
        return profile.rol === 'ADMIN' && profile.activo !== false;
      });
      if (activeAdmins.length === 0) {
        const error = new Error('Debe quedar al menos un administrador activo.');
        error.status = 400;
        throw error;
      }
      transaction.update(targetRef, applySentinels(req.body));
    });
  } else {
    await targetRef.update(applySentinels(req.body));
  }
  res.json({ data: { id } });
}

async function canApprove(areaId, uid) {
  if (!areaId) return false;
  const area = await db().collection('areas').doc(areaId).get();
  return area.exists && area.get('approverUid') === uid;
}

function applySentinels(value, key = '') {
  if (Array.isArray(value)) return value.map(item => applySentinels(item));
  if (value && typeof value === 'object') {
    if (value.__deleteField === true) return FieldValue.delete();
    if (value.__serverTimestamp === true) return FieldValue.serverTimestamp();
    return Object.fromEntries(Object.entries(value).map(([childKey, item]) =>
      [childKey, applySentinels(item, childKey)]));
  }
  if (typeof value === 'string' && ['fechaEmision', 'fechaRegistro', 'vbAt', 'pagadoAt',
    'actualizadoEn', 'uploadedAt'].includes(key)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return value;
}

function isValidDate(value) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function requiredText(value, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    const error = new Error('Uno o más campos de la planilla no son válidos.');
    error.status = 400;
    throw error;
  }
  return value.trim();
}

module.exports = { createPlanilla, deleteHistory, updateHistory, updateHistoryGroup, updateUser };
