import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class MovilidadesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  codigos!: string[];
}
