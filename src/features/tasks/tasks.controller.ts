import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SendMessagePayloadDto } from './dto/send-message-payload.dto';
import { UpdateScheduledTaskActionDto } from './dto/update-scheduled-task-action.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  findAll() {
    return this.tasksService.findAll();
  }

  @Get('scheduled')
  getScheduledMessages() : any {
    return this.tasksService.getScheduledMessages();
  }

  @Get('messages/history')
  getMessageHistory(@Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 100);
    return this.tasksService.getMessageHistory(parsedLimit);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.remove(id);
  }

  @Post('send-message')
  sendMessage(@Body() payload: SendMessagePayloadDto) {
    return this.tasksService.sendMessage(payload);
  }

  @Delete('scheduled/all')
  clearAllScheduledMessages() {
    return this.tasksService.clearAllScheduledMessages();
  }

  @Delete('scheduled/:jobName')
  cancelScheduledMessage(@Param('jobName') jobName: string) {
    return this.tasksService.cancelScheduledMessage(jobName);
  }

  @Patch('scheduled/:id/action')
  updateScheduledTaskAction(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateScheduledTaskActionDto,
  ) {
    return this.tasksService.updateScheduledTaskAction(id, body.action);
  }
}
