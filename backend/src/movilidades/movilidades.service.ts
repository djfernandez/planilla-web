import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/current-user.decorator';

@Injectable()
export class MovilidadesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: RequestUser) {
    const rows = await this.prisma.movilidadPartida.findMany({ orderBy: { codigo: 'asc' } });
    const codigos = rows.map((row) => row.codigo);
    const catalogo = await this.prisma.partidaContable.findMany({
      where: user.rol === 'ADMIN' ? undefined : { codigo: { in: codigos } },
      orderBy: { codigo: 'asc' },
    });
    if (user.rol === 'ADMIN') {
      return { codigos, partidas: catalogo };
    }
    const byCode = new Map(catalogo.map((item) => [item.codigo, item]));
    const partidas = codigos.map((codigo) => byCode.get(codigo) ?? { codigo, descripcion: '' });
    return { codigos, partidas };
  }

  async replace(codigos: string[]) {
    const clean = [...new Set(codigos.map((codigo) => codigo.trim()).filter(Boolean))];
    await this.prisma.$transaction(async (tx) => {
      for (const codigo of clean) {
        await tx.partidaContable.upsert({
          where: { codigo },
          update: {},
          create: { codigo, descripcion: '' },
        });
      }
      await tx.movilidadPartida.deleteMany({});
      if (clean.length) {
        await tx.movilidadPartida.createMany({ data: clean.map((codigo) => ({ codigo })) });
      }
    });
    const rows = await this.prisma.movilidadPartida.findMany({ orderBy: { codigo: 'asc' } });
    return { codigos: rows.map((row) => row.codigo) };
  }
}
