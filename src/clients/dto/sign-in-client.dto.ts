import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SignInClientDto {
  @ApiProperty({
    example: '1234567890',
    description: 'Unique identity card number of the client',
    maxLength: 20,
  })
  @IsNotEmpty()
  @IsString()
  identityCard: string;

  @ApiProperty({
    example: 'securepassword123',
    description: 'Password for the client account',
    minLength: 8,
    maxLength: 40,
  })
  @IsNotEmpty()
  @IsString()
  password: string;
}
