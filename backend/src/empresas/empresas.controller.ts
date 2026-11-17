import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import path from 'path';
import { AdminGuard } from '../auth/admin.guard';
import { StorageService } from '../storage/storage.service';
import { EmpresaDto } from './dto/empresa.dto';
import { EmpresasService } from './empresas.service';

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

@Controller('empresas')
export class EmpresasController {
  constructor(
    private readonly empresas: EmpresasService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  list() {
    return this.empresas.list();
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: EmpresaDto) {
    return this.empresas.create(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: EmpresaDto) {
    return this.empresas.update(id, dto);
  }

  @Post(':id/logo')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('logo'))
  logo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.empresas.saveLogo(id, file);
  }

  @Get(':id/logo')
  async download(@Param('id') id: string) {
    const relative = await this.empresas.logoPath(id);
    const ext = path.extname(relative).toLowerCase();
    return new StreamableFile(createReadStream(this.storage.resolve(relative)), {
      type: TYPES[ext] || 'application/octet-stream',
      disposition: `inline; filename="logo${ext || '.png'}"`,
    });
  }
}
