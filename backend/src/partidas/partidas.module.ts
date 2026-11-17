import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PartidasController } from './partidas.controller';
import { PartidasService } from './partidas.service';

@Module({
  imports: [AuthModule],
  controllers: [PartidasController],
  providers: [PartidasService],
  exports: [PartidasService],
})
export class PartidasModule {}
