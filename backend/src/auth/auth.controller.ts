import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AllowInactive, Public } from './public.decorator';
import { CurrentUser, RequestUser } from './current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { presentProfile } from '../users/user.presenter';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto.email, dto.password, res);
  }

  @Public()
  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.refresh_token, res);
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req.cookies?.refresh_token, res);
  }

  @AllowInactive()
  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    const full = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { empresa: true, area: true },
    });
    return presentProfile(full);
  }
}
