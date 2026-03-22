import { IsIn } from 'class-validator';

export class UpdateScheduledTaskActionDto {
  @IsIn(['activate', 'deactivate', 'delete'])
  action: 'activate' | 'deactivate' | 'delete';
}
