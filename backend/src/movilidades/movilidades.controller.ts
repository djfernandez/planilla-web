import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser, RequestUser } from '../auth/current-user.decorator';
import { MovilidadesDto } from './movilidades.dto';
import { MovilidadesService } from './movilidades.service';

@Controller('movilidades')
export class MovilidadesController {
  constructor(private readonly movilidades: MovilidadesService) {}

  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.movilidades.get(user);
  }

  @Put()
  @UseGuards(AdminGuard)
  replace(@Body() dto: MovilidadesDto) {
    return this.movilidades.replace(dto.codigos);
  }
}
