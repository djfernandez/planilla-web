import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MovilidadesController } from './movilidades.controller';
import { MovilidadesService } from './movilidades.service';

@Module({
  imports: [AuthModule],
  controllers: [MovilidadesController],
  providers: [MovilidadesService],
})
export class MovilidadesModule {}
