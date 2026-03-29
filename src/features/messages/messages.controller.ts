import { Controller, Get, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CurrentUserId } from '../../shared/decorators/current-user-id.decorator';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  findAll(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 200);
    return this.messagesService.findAll(userId, parsedLimit);
  }
}
