import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateStallDto {
  @ApiProperty({ description: 'Code of the stall', example: 'STL001' })
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiProperty({ description: 'Name of the stall', example: 'Fresh Fruits Stall' })
  @IsNotEmpty()
  @IsString()
  name: string;

  // Si tu relación Market es Mongo ObjectId:
  @ApiProperty({ description: 'Market ID (Mongo ObjectId)', example: '66cfe0a7f0b2b5d2b1c12345' })
  @IsNotEmpty()
  @IsMongoId()
  marketId: string;
  // Si en tu proyecto Market es numérico, usa:
  // @IsNotEmpty()
  // @IsInt()
  // marketId: number;

  // ---------- Opcionales / Flexibles ----------

  @ApiPropertyOptional({
    description: 'Estado del puesto (ej.: activo, por asignacion, inactivo, asignado)',
    example: 'activo',
  })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional({ description: 'Si el puesto está activo', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Etiquetas/Tags del puesto',
    example: ['frutas', 'orgánico', 'mayorista'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  etiquetas?: string[];

  @ApiPropertyOptional({
    description: 'Participantes (objeto libre, campos variables)',
    example: { socios: ['1720000000', '1730000000'], notas: 'Paga arriendo al día' },
  })
  @IsOptional()
  @IsObject()
  participantes?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Persona a cargo actual (objeto flexible)',
    example: {
      nombre: 'Ana',
      apellido: 'Pérez',
      email: 'ana@ejemplo.com',
      telefono: '0999999999',
      cedula: '1720000000',
      codigoDactilar: 'AB1234',
      fechaInicio: '2025-08-01',
    },
  })
  @IsOptional()
  @IsObject()
  personaACargoActual?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Personas a cargo anteriores (array de objetos flexibles)',
    example: [
      {
        nombre: 'Luis',
        apellido: 'García',
        email: 'lgarcia@ejemplo.com',
        telefono: '0988888888',
        cedula: '1711111111',
        codigoDactilar: 'CD5678',
        fechaInicio: '2024-01-01',
        fechaFin: '2025-07-31',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  personaACargoAnterior?: Array<Record<string, any>>;
}
