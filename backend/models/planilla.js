function serieFromProfile(profile) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const names = profile.nombres || profile.nombre || '';
  return `${normalize(names).slice(0, 2)}${normalize(profile.apellidos).slice(0, 2)}`.toUpperCase() + '001';
}

module.exports = { serieFromProfile };
