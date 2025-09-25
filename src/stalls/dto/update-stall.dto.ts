import { PartialType } from '@nestjs/swagger';
import { CreateStallDto } from './create-stall.dto';

export class UpdateStallDto extends PartialType(CreateStallDto) {}
