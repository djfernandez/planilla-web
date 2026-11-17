import { IsArray, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PartidaDto {
  @IsString()
  @MinLength(1)
  codigo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}

export class PartidaImportItem {
  @IsString()
  @MinLength(1)
  codigo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}

export class PartidaImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartidaImportItem)
  items!: PartidaImportItem[];
}
