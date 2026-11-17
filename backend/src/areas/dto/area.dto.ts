import { IsArray, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class AreaDto {
  @IsString()
  @Matches(/^[a-z0-9_-]+$/, { message: 'El id del área usa minúsculas, números, guion o guion bajo.' })
  id!: string;

  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsOptional()
  @IsString()
  approverId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedPrefixes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIds?: string[];
}

export class UpdateAreaDto {
  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsOptional()
  @IsString()
  approverId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedPrefixes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIds?: string[];
}
