import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { CurrentUser, RequestUser } from '../auth/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { FlagDto, UpdateLineaDto } from './planillas.dto';
import { PlanillasService } from './planillas.service';

@Controller()
export class PlanillasController {
  constructor(
    private readonly planillas: PlanillasService,
    private readonly storage: StorageService,
  ) {}

  @Get('planillas/siguiente')
  siguiente(@CurrentUser() user: RequestUser) {
    return this.planillas.siguiente(user);
  }

  @Get('planillas/acumulado')
  acumulado(@CurrentUser() user: RequestUser, @Query('fecha') fecha: string) {
    return this.planillas.acumulado(user, fecha);
  }

  @Get('planillas')
  list(
    @CurrentUser() user: RequestUser,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('areaId') areaId?: string,
    @Query('vb') vb?: string,
    @Query('pago') pago?: string,
    @Query('search') search?: string,
  ) {
    return this.planillas.list(user, { start, end, areaId, vb, pago, search });
  }

  @Post('planillas')
  @UseInterceptors(FileInterceptor('pdf', { limits: { fileSize: 15 * 1024 * 1024 } }))
  create(
    @CurrentUser() user: RequestUser,
    @UploadedFile() pdf: Express.Multer.File,
    @Body('payload') payload: string,
  ) {
    return this.planillas.create(user, payload, pdf);
  }

  @Get('planillas/:id/pdf')
  async pdf(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const file = await this.planillas.pdfPath(user, id);
    return new StreamableFile(createReadStream(this.storage.resolve(file.path)), {
      type: 'application/pdf',
      disposition: `inline; filename="${file.name}"`,
    });
  }

  @Patch('planillas/:id/vb')
  vb(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: FlagDto) {
    return this.planillas.setVb(user, id, dto.valor);
  }

  @Patch('planillas/:id/pago')
  pago(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: FlagDto) {
    return this.planillas.setPago(user, id, dto.valor);
  }

  @Patch('planillas/:id/lineas/:lineaId')
  updateLinea(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
    @Body() dto: UpdateLineaDto,
  ) {
    return this.planillas.updateLinea(user, id, lineaId, dto);
  }

  @Delete('planillas/:id/lineas/:lineaId')
  deleteLinea(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
  ) {
    return this.planillas.deleteLinea(user, id, lineaId);
  }

  @Post('planillas/:id/comprobantes')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 15 * 1024 * 1024 } }))
  comprobantes(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.planillas.addComprobantes(user, id, files);
  }

  @Get('comprobantes/:id/archivo')
  async archivo(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const file = await this.planillas.comprobanteFile(user, id);
    return new StreamableFile(createReadStream(this.storage.resolve(file.path)), {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${file.name}"`,
    });
  }
}
