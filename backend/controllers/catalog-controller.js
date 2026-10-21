const { db, serialize, serializeSnapshot } = require('../models/firestore');

const WRITABLE_COLLECTIONS = new Set(['empresas', 'partidasContables', 'areas', 'config']);

async function listBootstrap(req, res) {
  const firestore = db();
  const [companies, projects, pcs, areas, config] = await Promise.all([
    firestore.collection('empresas').get(),
    firestore.collection('proyectos').get(),
    firestore.collection('partidasContables').get(),
    firestore.collection('areas').get(),
    firestore.collection('config').doc('movilidades').get()
  ]);

  const isAdmin = req.profile.rol === 'ADMIN';
  const users = isAdmin ? await firestore.collection('users').get() : null;
  const approverAreaIds = serializeSnapshot(areas)
    .filter(area => area.approverUid === req.identity.uid)
    .map(area => area.id);

  let historyQuery = firestore.collection('history');
  if (!isAdmin) {
    if (approverAreaIds.length) {
      const [ownHistory, ...areaHistory] = await Promise.all([
        firestore.collection('history').where('userId', '==', req.identity.uid).get(),
        ...chunks(approverAreaIds, 30).map(ids =>
          firestore.collection('history').where('areaId', 'in', ids).get())
      ]);
      const unique = new Map();
      [...ownHistory.docs, ...areaHistory.flatMap(result => result.docs)].forEach(doc => unique.set(doc.id, doc));
      return res.json({
        data: makeBootstrap({ companies, projects, pcs, areas, config, users, history: [...unique.values()] })
      });
    }
    historyQuery = historyQuery.where('userId', '==', req.identity.uid);
  }

  const history = await historyQuery.get();
  res.json({ data: makeBootstrap({ companies, projects, pcs, areas, config, users, history: history.docs }) });
}

function makeBootstrap({ companies, projects, pcs, areas, config, users, history }) {
  return {
    empresas: serializeSnapshot(companies),
    proyectos: serializeSnapshot(projects),
    partidasContables: serializeSnapshot(pcs),
    areas: serializeSnapshot(areas),
    movilidades: config.exists ? serialize(config.data()) : null,
    usuarios: users ? serializeSnapshot(users) : [],
    historial: history.map(document => ({ id: document.id, ...serialize(document.data()) }))
  };
}

async function getCounter(req, res) {
  if (req.params.dni !== String(req.profile.dni || '')) {
    return res.status(403).json({ error: 'No puedes consultar el contador de otro usuario.' });
  }
  const snapshot = await db().collection('counters').doc(req.params.dni).get();
  res.json({ data: { count: snapshot.exists ? Number(snapshot.get('count') || 0) : 0 } });
}

async function saveCatalog(req, res) {
  const { collectionName, id } = req.params;
  if (!WRITABLE_COLLECTIONS.has(collectionName) || !id || id.includes('/')) {
    return res.status(404).json({ error: 'Recurso no encontrado.' });
  }
  await db().collection(collectionName).doc(id).set(req.body, { merge: req.method === 'PATCH' });
  res.json({ data: { id } });
}

async function removeCatalog(req, res) {
  const { collectionName, id } = req.params;
  if (!WRITABLE_COLLECTIONS.has(collectionName) || !id || id.includes('/')) {
    return res.status(404).json({ error: 'Recurso no encontrado.' });
  }
  await db().collection(collectionName).doc(id).delete();
  res.status(204).end();
}

async function importPartidas(req, res) {
  const rows = req.body.items;
  if (!Array.isArray(rows) || rows.length > 400) {
    return res.status(400).json({ error: 'Se requiere una lista de hasta 400 partidas.' });
  }
  if (rows.some(row => !row || typeof row.id !== 'string' || !row.id.trim() ||
      row.id.trim().includes('/'))) {
    return res.status(400).json({ error: 'Cada partida debe tener un código válido.' });
  }
  const batch = db().batch();
  for (const row of rows) {
    batch.set(db().collection('partidasContables').doc(row.id.trim()), {
      descripcion: String(row.descripcion || '').slice(0, 500)
    }, { merge: true });
  }
  await batch.commit();
  res.json({ data: { imported: rows.length } });
}

function chunks(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

module.exports = {
  getCounter,
  importPartidas,
  listBootstrap,
  removeCatalog,
  saveCatalog
};
