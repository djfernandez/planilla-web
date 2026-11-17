export type Rol = 'ADMIN' | 'USUARIO';

export type Empresa = {
  id: string;
  razon: string;
  ruc: string;
  direccion: string;
  hasLogo: boolean;
};

export type Area = {
  id: string;
  nombre: string;
  approverId: string | null;
  allowedPrefixes: string[];
  allowedIds: string[];
};

export type Me = {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  dni: string;
  rol: Rol;
  empresaId: string | null;
  areaId: string | null;
  proyDef: string;
  proyectos: string[];
  emailTo: string[];
  emailCc: string[];
  bank: string;
  accountNumber: string;
  currency: string;
  activo: boolean;
  hasRubrica: boolean;
  hasConsentimiento: boolean;
  empresa: Empresa | null;
  area: { id: string; nombre: string; approverId: string | null } | null;
};

export type Usuario = Omit<Me, 'empresa' | 'area'>;

export type Partida = { codigo: string; descripcion: string };

export type Linea = {
  id: string;
  orden: number;
  destino: string;
  motivo: string;
  proyecto: string;
  pc: string;
  monto: number;
};

export type Comprobante = {
  id: string;
  originalName: string;
  uploadedByName: string;
  uploadedAt: string;
};

export type Planilla = {
  id: string;
  serie: string;
  numero: string;
  clave: string;
  fechaEmision: string;
  fechaRegistro: string;
  userId: string;
  userDni: string;
  userNombre: string;
  areaId: string;
  areaNombre: string;
  vbOk: boolean;
  vbByName: string | null;
  vbAt: string | null;
  pagado: boolean;
  pagadoByName: string | null;
  pagadoAt: string | null;
  total: number;
  lineas: Linea[];
  comprobantes: Comprobante[];
};

export const BANCOS = ['INTERBANK', 'BBVA', 'SCOTIABANK', 'BCP'] as const;
export const MONEDAS = ['SOLES', 'DOLARES'] as const;
export const TOPE = 45;
