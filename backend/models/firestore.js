const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const db = () => getFirestore();

function serialize(value) {
  if (value instanceof Timestamp || (value && typeof value.toDate === 'function')) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function serializeSnapshot(snapshot) {
  return snapshot.docs.map(document => ({ id: document.id, ...serialize(document.data()) }));
}

module.exports = { db, serialize, serializeSnapshot };
