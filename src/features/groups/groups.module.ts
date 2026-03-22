import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [HttpModule],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
