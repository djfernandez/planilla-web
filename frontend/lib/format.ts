export const soles = (value: number) => `S/ ${Number(value || 0).toFixed(2)}`;

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function todayInput() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function serieFromName(nombres: string, apellidos: string) {
  const normalizar = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (normalizar(nombres).slice(0, 2) + normalizar(apellidos).slice(0, 2)).toUpperCase() + '001';
}
