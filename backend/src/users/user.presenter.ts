import { Empresa, Area, User } from '@prisma/client';

type UserWithRelations = User & {
  empresa: Empresa | null;
  area: Area | null;
};

export function presentUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    nombres: user.nombres,
    apellidos: user.apellidos,
    dni: user.dni,
    rol: user.rol,
    empresaId: user.empresaId,
    areaId: user.areaId,
    proyDef: user.proyDef,
    proyectos: user.proyectos,
    emailTo: user.emailTo,
    emailCc: user.emailCc,
    bank: user.bank,
    accountNumber: user.accountNumber,
    currency: user.currency,
    activo: user.activo,
    hasRubrica: Boolean(user.signaturePath),
    hasConsentimiento: Boolean(user.consentPdfPath),
    consentAt: user.consentAt,
    createdAt: user.createdAt,
  };
}

export function presentEmpresa(empresa: Empresa) {
  return {
    id: empresa.id,
    razon: empresa.razon,
    ruc: empresa.ruc,
    direccion: empresa.direccion,
    hasLogo: Boolean(empresa.logoPath),
  };
}

export function presentProfile(user: UserWithRelations) {
  return {
    ...presentUser(user),
    empresa: user.empresa ? presentEmpresa(user.empresa) : null,
    area: user.area
      ? { id: user.area.id, nombre: user.area.nombre, approverId: user.area.approverId }
      : null,
  };
}
