import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const BANCOS = ['INTERBANK', 'BBVA', 'SCOTIABANK', 'BCP'] as const;
const MONEDAS = ['SOLES', 'DOLARES'] as const;

export class CreateUserDto {
  @IsEmail({}, { message: 'Ingresa un correo válido.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La clave debe tener al menos 8 caracteres.' })
  password!: string;

  @IsString()
  @MinLength(1)
  nombres!: string;

  @IsString()
  @MinLength(1)
  apellidos!: string;

  @IsString()
  @MinLength(8, { message: 'El DNI debe tener al menos 8 caracteres.' })
  dni!: string;

  @IsOptional()
  @IsIn(['ADMIN', 'USUARIO'])
  rol?: 'ADMIN' | 'USUARIO';

  @IsOptional()
  @IsString()
  empresaId?: string | null;

  @IsOptional()
  @IsString()
  areaId?: string | null;

  @IsOptional()
  @IsString()
  proyDef?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  proyectos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailTo?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailCc?: string[];

  @IsOptional()
  @IsIn(BANCOS)
  bank?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsIn(MONEDAS)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nombres?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  apellidos?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  dni?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'USUARIO'])
  rol?: 'ADMIN' | 'USUARIO';

  @IsOptional()
  @IsString()
  empresaId?: string | null;

  @IsOptional()
  @IsString()
  areaId?: string | null;

  @IsOptional()
  @IsString()
  proyDef?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  proyectos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailTo?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailCc?: string[];

  @IsOptional()
  @IsIn(BANCOS)
  bank?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsIn(MONEDAS)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class PasswordDto {
  @IsString()
  @MinLength(8, { message: 'La clave debe tener al menos 8 caracteres.' })
  password!: string;
}
