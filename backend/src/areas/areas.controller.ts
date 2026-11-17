import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AreaDto, UpdateAreaDto } from './dto/area.dto';
import { AreasService } from './areas.service';

@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  list() {
    return this.areas.list();
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: AreaDto) {
    return this.areas.create(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateAreaDto) {
    return this.areas.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.areas.remove(id);
  }
}
