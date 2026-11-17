import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { presentEmpresa } from '../users/user.presenter';
import { EmpresaDto } from './dto/empresa.dto';

@Injectable()
export class EmpresasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list() {
    const empresas = await this.prisma.empresa.findMany({ orderBy: { razon: 'asc' } });
    return empresas.map(presentEmpresa);
  }

  async create(dto: EmpresaDto) {
    const empresa = await this.prisma.empresa.create({
      data: {
        razon: dto.razon.trim(),
        ruc: dto.ruc?.trim() ?? '',
        direccion: dto.direccion?.trim() ?? '',
      },
    });
    return presentEmpresa(empresa);
  }

  async update(id: string, dto: EmpresaDto) {
    await this.ensure(id);
    const empresa = await this.prisma.empresa.update({
      where: { id },
      data: {
        razon: dto.razon.trim(),
        ruc: dto.ruc?.trim() ?? '',
        direccion: dto.direccion?.trim() ?? '',
      },
    });
    return presentEmpresa(empresa);
  }

  async saveLogo(id: string, file: Express.Multer.File) {
    const empresa = await this.ensure(id);
    const ext = this.imageExt(file);
    const relative = `logos/${id}${ext}`;
    await this.storage.save(relative, file.buffer);
    if (empresa.logoPath && empresa.logoPath !== relative) {
      await this.storage.remove(empresa.logoPath);
    }
    await this.prisma.empresa.update({ where: { id }, data: { logoPath: relative } });
    return presentEmpresa({ ...empresa, logoPath: relative });
  }

  async logoPath(id: string) {
    const empresa = await this.ensure(id);
    if (!empresa.logoPath) throw new NotFoundException('La empresa no tiene logo.');
    return empresa.logoPath;
  }

  private async ensure(id: string) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada.');
    return empresa;
  }

  private imageExt(file: Express.Multer.File) {
    const byMime: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
    };
    const ext = byMime[file.mimetype] || path.extname(file.originalname || '').toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new BadRequestException('El logo debe ser PNG, JPG o WEBP.');
    }
    return ext === '.jpeg' ? '.jpg' : ext;
  }
}
