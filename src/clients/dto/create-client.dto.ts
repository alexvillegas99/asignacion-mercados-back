import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ example: '1234567890', description: 'Unique identity card number of the client' })
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  identityCard: string;

  @ApiProperty({ example: 'John Doe', description: 'Name of the client' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: '123 Main St, Springfield, USA',
    description: 'Address of the client',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    example: '+1234567890',
    description: 'Phone number of the client',
  })
  @IsString()
  @MaxLength(20)
  @MinLength(9)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    example: 'jhondoe@example.com',
    description: 'Email address of the client',
  })
  @IsString()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: 'securepassword123',
    description: 'Password for the client account',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(40)
  @IsOptional()
  password?: string;
}
