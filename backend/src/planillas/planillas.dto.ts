import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LineaPayload {
  @IsString()
  @MinLength(1)
  destino!: string;

  @IsString()
  @MinLength(1)
  motivo!: string;

  @IsString()
  proyecto!: string;

  @IsString()
  @MinLength(1)
  pc!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  monto!: number;
}

export class PlanillaPayload {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de emisión debe tener formato AAAA-MM-DD.' })
  fechaEmision!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaPayload)
  lineas!: LineaPayload[];
}

export class UpdateLineaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  destino?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  motivo?: string;

  @IsOptional()
  @IsString()
  proyecto?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  monto?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaEmision?: string;
}

export class FlagDto {
  @IsBoolean()
  valor!: boolean;
}
