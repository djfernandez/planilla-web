import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard';
import { PartidaDto, PartidaImportDto } from './partidas.dto';
import { PartidasService } from './partidas.service';

class DescripcionDto {
  @IsOptional()
  @IsString()
  descripcion?: string;
}

@Controller('partidas')
@UseGuards(AdminGuard)
export class PartidasController {
  constructor(private readonly partidas: PartidasService) {}

  @Get()
  list() {
    return this.partidas.list();
  }

  @Post()
  create(@Body() dto: PartidaDto) {
    return this.partidas.upsert(dto);
  }

  @Post('importar')
  importar(@Body() dto: PartidaImportDto) {
    return this.partidas.importMany(dto);
  }

  @Patch(':codigo')
  update(@Param('codigo') codigo: string, @Body() dto: DescripcionDto) {
    return this.partidas.update(codigo, dto.descripcion ?? '');
  }

  @Delete(':codigo')
  remove(@Param('codigo') codigo: string) {
    return this.partidas.remove(codigo);
  }
}
