const assert = require('node:assert/strict');
const { test } = require('node:test');
const { canUpdateHistory, canUpdateUser } = require('../models/authorization');

test('area approvers can only change V°B° fields', () => {
  assert.equal(canUpdateHistory('USUARIO', true, { vbOk: true, vbByUid: 'approver-1' }), true);
  assert.equal(canUpdateHistory('USUARIO', true, { pagado: true }), false);
  assert.equal(canUpdateHistory('USUARIO', false, { vbOk: true }), false);
});

test('only administrators can update arbitrary user profiles', () => {
  assert.equal(canUpdateUser('USUARIO', true, { rubricaBase64: 'signature' }), true);
  assert.equal(canUpdateUser('USUARIO', true, { rol: 'ADMIN' }), false);
  assert.equal(canUpdateUser('USUARIO', false, { nombres: 'Other' }), false);
  assert.equal(canUpdateUser('ADMIN', false, { nombres: 'Other' }), true);
});
