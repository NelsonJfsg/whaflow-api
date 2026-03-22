import {
  ArrayMinSize,
  IsInt,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecipientDto } from './recipient.dto';
import { SendWindowDto } from './send-window.dto';
import { SendMessagePayload } from '../interfaces/send-message-payload.interface';

export class SendMessagePayloadDto implements SendMessagePayload {
  @IsBoolean()
  is_forwarded: boolean;

  @IsString()
  @MinLength(10)
  message: string;

  @IsInt()
  @Min(0)
  frequency: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SendWindowDto)
  send_window?: SendWindowDto;
}
