import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { ScheduledMessageTask } from './entities/scheduled-message-task.entity';
import { MessageDispatchLog } from './entities/message-dispatch-log.entity';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Task, ScheduledMessageTask, MessageDispatchLog]),
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
