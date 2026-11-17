import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, res: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new UnauthorizedException('Correo o clave incorrectos.');
    }
    await this.issueSession(user, res);
    return { ok: true };
  }

  async refresh(rawToken: string | undefined, res: Response) {
    if (!rawToken) throw new UnauthorizedException('Sesión expirada.');
    const tokenHash = this.hash(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.expiresAt.getTime() < Date.now()) {
      if (stored) await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Sesión expirada.');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    await this.issueSession(stored.user, res);
    return { ok: true };
  }

  async logout(rawToken: string | undefined, res: Response) {
    if (rawToken) {
      await this.prisma.refreshToken.deleteMany({ where: { tokenHash: this.hash(rawToken) } });
    }
    this.clearCookies(res);
    return { ok: true };
  }

  private async issueSession(user: User, res: Response) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
    const rawRefresh = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(rawRefresh),
        expiresAt: new Date(Date.now() + REFRESH_MS),
      },
    });
    const base = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      path: '/',
    };
    res.cookie('access_token', accessToken, { ...base, maxAge: ACCESS_MS });
    res.cookie('refresh_token', rawRefresh, { ...base, maxAge: REFRESH_MS });
  }

  private clearCookies(res: Response) {
    const options = { path: '/' };
    res.clearCookie('access_token', options);
    res.clearCookie('refresh_token', options);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
