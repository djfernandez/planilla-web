import { IsOptional, IsString, MinLength } from 'class-validator';

export class EmpresaDto {
  @IsString()
  @MinLength(1, { message: 'La razón social es obligatoria.' })
  razon!: string;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsOptional()
  @IsString()
  direccion?: string;
}
