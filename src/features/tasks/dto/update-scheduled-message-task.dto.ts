import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecipientDto } from './recipient.dto';
import { UpdateSendWindowDto } from './update-send-window.dto';

export class UpdateScheduledMessageTaskDto {
  @IsOptional()
  @IsBoolean()
  is_forwarded?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  message?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  frequency?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients?: RecipientDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSendWindowDto)
  send_window?: UpdateSendWindowDto;
}
