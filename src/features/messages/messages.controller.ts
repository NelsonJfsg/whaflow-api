import { Controller, Get, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  findAll(@Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 200);
    return this.messagesService.findAll(parsedLimit);
  }
}
