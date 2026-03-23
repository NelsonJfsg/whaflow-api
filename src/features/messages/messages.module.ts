import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageDispatchLog } from '../tasks/entities/message-dispatch-log.entity';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [TypeOrmModule.forFeature([MessageDispatchLog])],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
