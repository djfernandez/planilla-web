import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestUser } from '../auth/current-user.decorator';
import { cents, dateOnlyString, displayName, parseDateOnly, safeFileName, serieFromName, TOPE_SOLES } from '../common/domain';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PlanillaPayload, UpdateLineaDto } from './planillas.dto';

const includePlanilla = {
  lineas: { orderBy: { orden: 'asc' as const } },
  comprobantes: { orderBy: { uploadedAt: 'asc' as const } },
};

type PlanillaFull = Prisma.PlanillaGetPayload<{ include: typeof includePlanilla }>;

@Injectable()
export class PlanillasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async siguiente(user: RequestUser) {
    const counter = await this.prisma.counter.findUnique({ where: { dni: user.dni } });
    const numero = String((counter?.count ?? 0) + 1).padStart(5, '0');
    return { serie: serieFromName(user.nombres, user.apellidos), numero };
  }

  async acumulado(user: RequestUser, fecha: string) {
    const date = this.fecha(fecha);
    const gastado = await this.gastado(this.prisma, user.dni, date);
    return {
      gastado: gastado / 100,
      tope: TOPE_SOLES,
      disponible: Math.max(0, (TOPE_SOLES * 100 - gastado) / 100),
    };
  }

  async list(
    user: RequestUser,
    filtros: { start?: string; end?: string; areaId?: string; vb?: string; pago?: string; search?: string },
  ) {
    const where: Prisma.PlanillaWhereInput = { AND: [await this.alcance(user)] };
    const and = where.AND as Prisma.PlanillaWhereInput[];
    if (filtros.start) and.push({ fechaEmision: { gte: this.fecha(filtros.start) } });
    if (filtros.end) and.push({ fechaEmision: { lte: this.fecha(filtros.end) } });
    if (filtros.areaId) and.push({ areaId: filtros.areaId });
    if (filtros.vb === 'APROBADO') and.push({ vbOk: true });
    if (filtros.vb === 'PENDIENTE') and.push({ vbOk: false });
    if (filtros.pago === 'PAGADO') and.push({ pagado: true });
    if (filtros.pago === 'NOPAGADO') and.push({ pagado: false });
    const q = filtros.search?.trim();
    if (q) {
      and.push({
        OR: [
          { serie: { contains: q, mode: 'insensitive' } },
          { numero: { contains: q, mode: 'insensitive' } },
          { userNombre: { contains: q, mode: 'insensitive' } },
          { userDni: { contains: q, mode: 'insensitive' } },
          { areaNombre: { contains: q, mode: 'insensitive' } },
          { areaId: { contains: q, mode: 'insensitive' } },
          {
            lineas: {
              some: {
                OR: [
                  { destino: { contains: q, mode: 'insensitive' } },
                  { motivo: { contains: q, mode: 'insensitive' } },
                  { proyecto: { contains: q, mode: 'insensitive' } },
                  { pc: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      });
    }
    const rows = await this.prisma.planilla.findMany({
      where,
      include: includePlanilla,
      orderBy: { fechaRegistro: 'desc' },
    });
    return rows.map((row) => this.present(row));
  }

  async create(user: RequestUser, payloadRaw: string, pdf: Express.Multer.File) {
    if (!pdf?.buffer?.length) throw new BadRequestException('Adjunta el PDF de la planilla.');
    if (pdf.mimetype && pdf.mimetype !== 'application/pdf' && !pdf.originalname.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('El archivo de la planilla debe ser un PDF.');
    }
    const fullUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!fullUser?.signaturePath) {
      throw new BadRequestException('Registra tu rúbrica antes de emitir una planilla.');
    }
    const payload = await this.parsePayload(payloadRaw);
    const fecha = this.fecha(payload.fechaEmision);
    const lineas = payload.lineas.map((linea, index) => ({
      orden: index + 1,
      destino: linea.destino.trim().toUpperCase(),
      motivo: linea.motivo.trim().toUpperCase(),
      proyecto: linea.proyecto.trim().toUpperCase(),
      pc: linea.pc.trim(),
      monto: new Prisma.Decimal(linea.monto.toFixed(2)),
    }));
    await this.assertPartidasPermitidas(user, lineas.map((linea) => linea.pc));
    const nuevo = lineas.reduce((sum, linea) => sum + cents(linea.monto), 0);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fullUser.dni})::bigint)`;
      const gastado = await this.gastado(tx, fullUser.dni, fecha);
      if (gastado + nuevo > TOPE_SOLES * 100) {
        throw new BadRequestException(`Con este monto superas el tope de S/ ${TOPE_SOLES.toFixed(2)} para este día.`);
      }
      const counter = await tx.counter.upsert({
        where: { dni: fullUser.dni },
        create: { dni: fullUser.dni, count: 1 },
        update: { count: { increment: 1 } },
      });
      const serie = serieFromName(fullUser.nombres, fullUser.apellidos);
      const numero = String(counter.count).padStart(5, '0');
      const area = fullUser.areaId
        ? await tx.area.findUnique({ where: { id: fullUser.areaId } })
        : null;
      return tx.planilla.create({
        data: {
          serie,
          numero,
          fechaEmision: fecha,
          userId: fullUser.id,
          userDni: fullUser.dni,
          userNombre: displayName(fullUser.nombres, fullUser.apellidos),
          areaId: fullUser.areaId ?? '',
          areaNombre: area?.nombre ?? '',
          pdfPath: `planillas/${fullUser.id}/${serie}-${numero}.pdf`,
          lineas: { create: lineas },
        },
        include: includePlanilla,
      });
    });

    try {
      await this.storage.save(created.pdfPath, pdf.buffer);
    } catch (error) {
      await this.prisma.planilla.delete({ where: { id: created.id } });
      throw error;
    }
    return this.present(created);
  }

  async pdfPath(user: RequestUser, id: string) {
    const planilla = await this.leer(user, id);
    return { path: planilla.pdfPath, name: `${planilla.serie}-${planilla.numero}.pdf` };
  }

  async setVb(user: RequestUser, id: string, vbOk: boolean) {
    const planilla = await this.leer(user, id);
    await this.assertAprueba(user, planilla.areaId);
    const updated = await this.prisma.planilla.update({
      where: { id },
      data: vbOk
        ? { vbOk: true, vbById: user.id, vbByName: displayName(user.nombres, user.apellidos), vbAt: new Date() }
        : { vbOk: false, vbById: null, vbByName: null, vbAt: null },
      include: includePlanilla,
    });
    return this.present(updated);
  }

  async setPago(user: RequestUser, id: string, pagado: boolean) {
    this.assertAdmin(user);
    await this.leer(user, id);
    const updated = await this.prisma.planilla.update({
      where: { id },
      data: pagado
        ? {
            pagado: true,
            pagadoById: user.id,
            pagadoByName: displayName(user.nombres, user.apellidos),
            pagadoAt: new Date(),
          }
        : { pagado: false, pagadoById: null, pagadoByName: null, pagadoAt: null },
      include: includePlanilla,
    });
    return this.present(updated);
  }

  async updateLinea(user: RequestUser, planillaId: string, lineaId: string, dto: UpdateLineaDto) {
    this.assertAdmin(user);
    const planilla = await this.leer(user, planillaId);
    const linea = planilla.lineas.find((item) => item.id === lineaId);
    if (!linea) throw new NotFoundException('Línea no encontrada.');
    const fecha = dto.fechaEmision ? this.fecha(dto.fechaEmision) : planilla.fechaEmision;
    const monto = dto.monto != null ? new Prisma.Decimal(dto.monto.toFixed(2)) : linea.monto;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${planilla.userDni})::bigint)`;
      const gastado = await this.gastado(tx, planilla.userDni, fecha, lineaId);
      if (gastado + cents(monto) > TOPE_SOLES * 100) {
        throw new BadRequestException(`Con este monto superas el tope de S/ ${TOPE_SOLES.toFixed(2)} para este día.`);
      }
      await tx.planillaLinea.update({
        where: { id: lineaId },
        data: {
          destino: dto.destino?.trim().toUpperCase(),
          motivo: dto.motivo?.trim().toUpperCase(),
          proyecto: dto.proyecto?.trim().toUpperCase(),
          monto,
        },
      });
      if (dto.fechaEmision) {
        await tx.planilla.update({ where: { id: planillaId }, data: { fechaEmision: fecha } });
      }
    });
    return this.present(await this.leer(user, planillaId));
  }

  async deleteLinea(user: RequestUser, planillaId: string, lineaId: string) {
    this.assertAdmin(user);
    const planilla = await this.leer(user, planillaId);
    const linea = planilla.lineas.find((item) => item.id === lineaId);
    if (!linea) throw new NotFoundException('Línea no encontrada.');
    if (planilla.lineas.length === 1) {
      await this.storage.remove(planilla.pdfPath);
      for (const comp of planilla.comprobantes) await this.storage.remove(comp.storagePath);
      await this.prisma.planilla.delete({ where: { id: planillaId } });
      return { ok: true, eliminada: true };
    }
    await this.prisma.planillaLinea.delete({ where: { id: lineaId } });
    return this.present(await this.leer(user, planillaId));
  }

  async addComprobantes(user: RequestUser, planillaId: string, files: Express.Multer.File[]) {
    this.assertAdmin(user);
    const planilla = await this.leer(user, planillaId);
    if (!planilla.pagado) {
      throw new BadRequestException('Solo se pueden adjuntar comprobantes si la planilla está pagada.');
    }
    if (!files?.length) throw new BadRequestException('Selecciona al menos un archivo.');
    const key = `${planilla.serie}-${planilla.numero}`;
    for (const file of files) {
      const name = safeFileName(file.originalname || 'comprobante');
      const relative = `comprobantes/${planilla.userId}/${key}/${Date.now()}-${name}`;
      await this.storage.save(relative, file.buffer);
      await this.prisma.comprobante.create({
        data: {
          planillaId,
          originalName: file.originalname || name,
          storagePath: relative,
          uploadedById: user.id,
          uploadedByName: displayName(user.nombres, user.apellidos),
        },
      });
    }
    return this.present(await this.leer(user, planillaId));
  }

  async comprobanteFile(user: RequestUser, id: string) {
    const comp = await this.prisma.comprobante.findUnique({ where: { id }, include: { planilla: true } });
    if (!comp) throw new NotFoundException('Comprobante no encontrado.');
    await this.leer(user, comp.planillaId);
    return { path: comp.storagePath, name: safeFileName(comp.originalName) };
  }

  private async parsePayload(raw: string) {
    let json: unknown;
    try {
      json = JSON.parse(raw || '');
    } catch {
      throw new BadRequestException('El detalle de la planilla no es válido.');
    }
    const dto = plainToInstance(PlanillaPayload, json);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length) {
      throw new BadRequestException('Revisa destino, motivo, partida y monto de cada fila.');
    }
    return dto;
  }

  private async assertPartidasPermitidas(user: RequestUser, codigos: string[]) {
    if (user.rol === 'ADMIN') return;
    const permitidas = await this.prisma.movilidadPartida.findMany();
    const set = new Set(permitidas.map((item) => item.codigo));
    const invalida = codigos.find((codigo) => !set.has(codigo));
    if (invalida) throw new BadRequestException(`La partida ${invalida} no está habilitada para movilidades.`);
  }

  private async alcance(user: RequestUser): Promise<Prisma.PlanillaWhereInput> {
    if (user.rol === 'ADMIN') return {};
    const areas = await this.prisma.area.findMany({ where: { approverId: user.id }, select: { id: true } });
    if (!areas.length) return { userId: user.id };
    return { OR: [{ userId: user.id }, { areaId: { in: areas.map((area) => area.id) } }] };
  }

  private async leer(user: RequestUser, id: string) {
    const planilla = await this.prisma.planilla.findFirst({
      where: { id, AND: [await this.alcance(user)] },
      include: includePlanilla,
    });
    if (!planilla) throw new NotFoundException('Planilla no encontrada.');
    return planilla;
  }

  private async assertAprueba(user: RequestUser, areaId: string) {
    if (user.rol === 'ADMIN') return;
    if (!areaId) throw new ForbiddenException('No tienes permisos para dar VB en esta área.');
    const area = await this.prisma.area.findUnique({ where: { id: areaId } });
    if (area?.approverId !== user.id) {
      throw new ForbiddenException('No tienes permisos para dar VB en esta área.');
    }
  }

  private assertAdmin(user: RequestUser) {
    if (user.rol !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede hacer esto.');
  }

  private fecha(value: string) {
    const date = parseDateOnly(value);
    if (!date) throw new BadRequestException('Fecha inválida.');
    return date;
  }

  private async gastado(
    db: PrismaService | Prisma.TransactionClient,
    dni: string,
    fecha: Date,
    excludeLineaId?: string,
  ) {
    const agg = await db.planillaLinea.aggregate({
      _sum: { monto: true },
      where: {
        id: excludeLineaId ? { not: excludeLineaId } : undefined,
        planilla: { userDni: dni, fechaEmision: fecha },
      },
    });
    return cents(agg._sum.monto ?? 0);
  }

  private present(planilla: PlanillaFull) {
    const total = planilla.lineas.reduce((sum, linea) => sum + Number(linea.monto), 0);
    return {
      id: planilla.id,
      serie: planilla.serie,
      numero: planilla.numero,
      clave: `${planilla.serie}-${planilla.numero}`,
      fechaEmision: dateOnlyString(planilla.fechaEmision),
      fechaRegistro: planilla.fechaRegistro.toISOString(),
      userId: planilla.userId,
      userDni: planilla.userDni,
      userNombre: planilla.userNombre,
      areaId: planilla.areaId,
      areaNombre: planilla.areaNombre,
      vbOk: planilla.vbOk,
      vbByName: planilla.vbByName,
      vbAt: planilla.vbAt?.toISOString() ?? null,
      pagado: planilla.pagado,
      pagadoByName: planilla.pagadoByName,
      pagadoAt: planilla.pagadoAt?.toISOString() ?? null,
      total,
      lineas: planilla.lineas.map((linea) => ({
        id: linea.id,
        orden: linea.orden,
        destino: linea.destino,
        motivo: linea.motivo,
        proyecto: linea.proyecto,
        pc: linea.pc,
        monto: Number(linea.monto),
      })),
      comprobantes: planilla.comprobantes.map((comp) => ({
        id: comp.id,
        originalName: comp.originalName,
        uploadedByName: comp.uploadedByName,
        uploadedAt: comp.uploadedAt.toISOString(),
      })),
    };
  }
}
