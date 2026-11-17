import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { AdminGuard } from '../auth/admin.guard';
import { AllowInactive } from '../auth/public.decorator';
import { CurrentUser, RequestUser } from '../auth/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { CreateUserDto, PasswordDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('usuarios')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @UseGuards(AdminGuard)
  list() {
    return this.users.list();
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor.id, id, dto);
  }

  @Patch(':id/clave')
  @UseGuards(AdminGuard)
  setPassword(@Param('id') id: string, @Body() dto: PasswordDto) {
    return this.users.setPassword(id, dto.password);
  }

  @Post(':id/reset-consentimiento')
  @UseGuards(AdminGuard)
  resetConsent(@Param('id') id: string) {
    return this.users.resetConsent(id);
  }

  @Post('consentimiento')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'firma', maxCount: 1 },
      { name: 'consentimiento', maxCount: 1 },
    ]),
  )
  consent(
    @CurrentUser() user: RequestUser,
    @UploadedFiles()
    files: { firma?: Express.Multer.File[]; consentimiento?: Express.Multer.File[] },
  ) {
    return this.users.saveConsent(user.id, files.firma?.[0] as Express.Multer.File, files.consentimiento?.[0] as Express.Multer.File);
  }

  @Get(':id/firma')
  @AllowInactive()
  async firma(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    const relative = await this.users.firmaFile(actor, id);
    return new StreamableFile(createReadStream(this.storage.resolve(relative)), {
      type: 'image/png',
      disposition: 'inline; filename="rubrica.png"',
    });
  }

  @Get(':id/consentimiento')
  async consentimiento(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    const relative = await this.users.consentimientoFile(actor, id);
    return new StreamableFile(createReadStream(this.storage.resolve(relative)), {
      type: 'application/pdf',
      disposition: 'inline; filename="consentimiento.pdf"',
    });
  }
}
