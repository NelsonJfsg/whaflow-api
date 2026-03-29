import { Controller, Get } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CurrentUserId } from '../../shared/decorators/current-user-id.decorator';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get('my')
  getMyGroups(@CurrentUserId() userId: string) {
    return this.groupsService.getMyGroups(userId);
  }
}
