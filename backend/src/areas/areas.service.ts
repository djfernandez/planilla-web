import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AreaDto, UpdateAreaDto } from './dto/area.dto';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.area.findMany({ orderBy: { nombre: 'asc' } });
  }

  async create(dto: AreaDto) {
    try {
      return await this.prisma.area.create({ data: this.data(dto.id, dto) });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async update(id: string, dto: UpdateAreaDto) {
    await this.ensure(id);
    try {
      return await this.prisma.area.update({ where: { id }, data: this.data(id, dto) });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async remove(id: string) {
    const members = await this.prisma.user.count({ where: { areaId: id } });
    if (members > 0) {
      throw new BadRequestException('No se puede eliminar un área que todavía tiene usuarios.');
    }
    await this.ensure(id);
    await this.prisma.area.delete({ where: { id } });
    return { ok: true };
  }

  private data(id: string, dto: AreaDto | UpdateAreaDto) {
    const approver = 'approverId' in dto ? dto.approverId : undefined;
    return {
      id,
      nombre: dto.nombre.trim(),
      approverId: approver == null || approver.trim() === '' ? null : approver.trim(),
      allowedPrefixes: (dto.allowedPrefixes ?? []).map((item) => item.trim()).filter(Boolean),
      allowedIds: (dto.allowedIds ?? []).map((item) => item.trim()).filter(Boolean),
    };
  }

  private async ensure(id: string) {
    const area = await this.prisma.area.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Área no encontrada.');
    return area;
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un área con ese id.');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new BadRequestException('El aprobador indicado no existe.');
    }
    throw error;
  }
}
