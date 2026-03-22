import { Controller, Get } from '@nestjs/common';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get('my')
  getMyGroups() {
    console.log('Received request to get my groups');
    return this.groupsService.getMyGroups();
  }
}
