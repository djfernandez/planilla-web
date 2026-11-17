import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Ingresa un correo válido.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Ingresa tu clave.' })
  password!: string;
}
