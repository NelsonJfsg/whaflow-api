import { IsOptional, Matches } from 'class-validator';

export class UpdateSendWindowDto {
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  end?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start_at?: string;
}
