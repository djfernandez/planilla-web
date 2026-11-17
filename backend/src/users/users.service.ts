import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { presentProfile, presentUser } from './user.presenter';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({ orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }] });
    return users.map(presentUser);
  }

  async profile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { empresa: true, area: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return presentProfile(user);
  }

  async create(dto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          passwordHash: await bcrypt.hash(dto.password, 10),
          nombres: dto.nombres.trim(),
          apellidos: dto.apellidos.trim(),
          dni: dto.dni.trim(),
          rol: dto.rol ?? 'USUARIO',
          empresaId: this.emptyToNull(dto.empresaId),
          areaId: this.emptyToNull(dto.areaId),
          proyDef: dto.proyDef?.trim() ?? '',
          proyectos: this.cleanList(dto.proyectos),
          emailTo: this.cleanList(dto.emailTo),
          emailCc: this.cleanList(dto.emailCc),
          bank: dto.bank ?? 'BCP',
          accountNumber: dto.accountNumber?.trim() ?? '',
          currency: dto.currency ?? 'SOLES',
          activo: dto.activo ?? true,
        },
      });
      return presentUser(user);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(actorId: string, id: string, dto: UpdateUserDto) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuario no encontrado.');

    const activo = dto.activo ?? current.activo;
    const rol = dto.rol ?? current.rol;
    if (id === actorId && activo === false) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta.');
    }
    const otrosAdmins = await this.prisma.user.count({
      where: { id: { not: id }, rol: 'ADMIN', activo: true },
    });
    if (otrosAdmins === 0 && !(rol === 'ADMIN' && activo)) {
      throw new BadRequestException('Debe quedar al menos un administrador activo.');
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          nombres: dto.nombres?.trim(),
          apellidos: dto.apellidos?.trim(),
          dni: dto.dni?.trim(),
          rol,
          empresaId: dto.empresaId === undefined ? undefined : this.emptyToNull(dto.empresaId),
          areaId: dto.areaId === undefined ? undefined : this.emptyToNull(dto.areaId),
          proyDef: dto.proyDef?.trim(),
          proyectos: dto.proyectos ? this.cleanList(dto.proyectos) : undefined,
          emailTo: dto.emailTo ? this.cleanList(dto.emailTo) : undefined,
          emailCc: dto.emailCc ? this.cleanList(dto.emailCc) : undefined,
          bank: dto.bank,
          accountNumber: dto.accountNumber?.trim(),
          currency: dto.currency,
          activo,
        },
      });
      return presentUser(user);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async setPassword(id: string, password: string) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuario no encontrado.');
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    return { ok: true };
  }

  async resetConsent(id: string) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuario no encontrado.');
    await this.storage.remove(current.signaturePath);
    await this.storage.remove(current.consentPdfPath);
    await this.prisma.user.update({
      where: { id },
      data: { signaturePath: null, consentPdfPath: null, consentAt: null },
    });
    return { ok: true };
  }

  async saveConsent(userId: string, firma: Express.Multer.File, pdf: Express.Multer.File) {
    if (!firma || !pdf) {
      throw new BadRequestException('Falta la rúbrica o el PDF de consentimiento.');
    }
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw new NotFoundException('Usuario no encontrado.');
    const signaturePath = await this.storage.save(`firmas/${userId}.png`, firma.buffer);
    const consentPdfPath = await this.storage.save(`consentimientos/${userId}.pdf`, pdf.buffer);
    await this.storage.remove(current.signaturePath && current.signaturePath !== signaturePath ? current.signaturePath : null);
    await this.prisma.user.update({
      where: { id: userId },
      data: { signaturePath, consentPdfPath, consentAt: new Date() },
    });
    return this.profile(userId);
  }

  async firmaFile(actor: { id: string; rol: string }, userId: string) {
    return this.ownedFile(actor, userId, 'signaturePath');
  }

  async consentimientoFile(actor: { id: string; rol: string }, userId: string) {
    return this.ownedFile(actor, userId, 'consentPdfPath');
  }

  private async ownedFile(
    actor: { id: string; rol: string },
    userId: string,
    field: 'signaturePath' | 'consentPdfPath',
  ) {
    if (actor.rol !== 'ADMIN' && actor.id !== userId) {
      throw new NotFoundException('Archivo no encontrado.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const relative = user?.[field];
    if (!user || !relative) throw new NotFoundException('Archivo no encontrado.');
    return relative;
  }

  private emptyToNull(value: string | null | undefined) {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private cleanList(values: string[] | undefined) {
    return (values ?? []).map((item) => item.trim()).filter(Boolean);
  }

  private rethrowUnique(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String(error.meta?.target ?? '');
      if (target.includes('email')) throw new ConflictException('Ese correo ya está registrado.');
      if (target.includes('dni')) throw new ConflictException('Ese DNI ya está registrado.');
      throw new ConflictException('El registro ya existe.');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new BadRequestException('La empresa o el área indicada no existe.');
    }
    throw error;
  }
}
