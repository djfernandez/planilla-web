import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlanillasController } from './planillas.controller';
import { PlanillasService } from './planillas.service';

@Module({
  imports: [AuthModule],
  controllers: [PlanillasController],
  providers: [PlanillasService],
})
export class PlanillasModule {}
