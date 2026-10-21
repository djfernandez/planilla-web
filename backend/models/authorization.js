const APPROVER_HISTORY_FIELDS = new Set(['vbOk', 'vbByUid', 'vbByName', 'vbAt']);
const SELF_PROFILE_FIELDS = new Set(['rubricaBase64', 'consentPdfUrl']);

function canUpdateHistory(role, isApprover, changes) {
  return role === 'ADMIN' || (isApprover && hasOnlyKeys(changes, APPROVER_HISTORY_FIELDS));
}

function canUpdateUser(role, isSelf, changes) {
  return role === 'ADMIN' || (isSelf && hasOnlyKeys(changes, SELF_PROFILE_FIELDS));
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0 &&
    Object.keys(value).every(key => allowed.has(key));
}

module.exports = { canUpdateHistory, canUpdateUser };
