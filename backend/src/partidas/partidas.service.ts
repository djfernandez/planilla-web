import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PartidaDto, PartidaImportDto } from './partidas.dto';

@Injectable()
export class PartidasService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.partidaContable.findMany({ orderBy: { codigo: 'asc' } });
  }

  async upsert(dto: PartidaDto) {
    const codigo = dto.codigo.trim();
    return this.prisma.partidaContable.upsert({
      where: { codigo },
      create: { codigo, descripcion: dto.descripcion?.trim() ?? '' },
      update: { descripcion: dto.descripcion?.trim() ?? '' },
    });
  }

  async update(codigo: string, descripcion: string) {
    await this.ensure(codigo);
    return this.prisma.partidaContable.update({
      where: { codigo },
      data: { descripcion: descripcion.trim() },
    });
  }

  async remove(codigo: string) {
    await this.ensure(codigo);
    await this.prisma.movilidadPartida.deleteMany({ where: { codigo } });
    await this.prisma.partidaContable.delete({ where: { codigo } });
    return { ok: true };
  }

  async importMany(dto: PartidaImportDto) {
    for (const item of dto.items) {
      const codigo = item.codigo.trim();
      if (!codigo) continue;
      await this.prisma.partidaContable.upsert({
        where: { codigo },
        create: { codigo, descripcion: item.descripcion?.trim() ?? '' },
        update: { descripcion: item.descripcion?.trim() ?? '' },
      });
    }
    return this.list();
  }

  private async ensure(codigo: string) {
    const row = await this.prisma.partidaContable.findUnique({ where: { codigo } });
    if (!row) throw new NotFoundException('Partida no encontrada.');
    return row;
  }
}
