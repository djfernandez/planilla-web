export const TOPE_SOLES = 45;

export function cents(value: number | { toString(): string }) {
  return Math.round(Number(value) * 100);
}

export function serieFromName(nombres: string, apellidos: string) {
  const normalizar = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (normalizar(nombres).slice(0, 2) + normalizar(apellidos).slice(0, 2)).toUpperCase() + '001';
}

export function displayName(nombres: string, apellidos: string) {
  return `${nombres} ${apellidos}`.trim();
}

export function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

export function dateOnlyString(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function safeFileName(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return (base || 'archivo').slice(0, 120);
}
