import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { ActiveGuard } from './auth/active.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { EmpresasModule } from './empresas/empresas.module';
import { AreasModule } from './areas/areas.module';
import { PartidasModule } from './partidas/partidas.module';
import { MovilidadesModule } from './movilidades/movilidades.module';
import { PlanillasModule } from './planillas/planillas.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    AuthModule,
    UsersModule,
    EmpresasModule,
    AreasModule,
    PartidasModule,
    MovilidadesModule,
    PlanillasModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ActiveGuard },
  ],
})
export class AppModule {}
