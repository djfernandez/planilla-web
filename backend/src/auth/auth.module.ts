import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ActiveGuard } from './active.guard';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, ActiveGuard, AdminGuard],
  exports: [AuthService, JwtAuthGuard, ActiveGuard, AdminGuard],
})
export class AuthModule {}
