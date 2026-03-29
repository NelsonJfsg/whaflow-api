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
import { UpdateScheduledMessageTaskDto } from './dto/update-scheduled-message-task.dto';
import { TasksService } from './tasks.service';
import { CurrentUserId } from '../../shared/decorators/current-user-id.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(userId, createTaskDto);
  }

  @Get()
  findAll(@CurrentUserId() userId: string) {
    return this.tasksService.findAll(userId);
  }

  @Get('scheduled')
  getScheduledMessages(@CurrentUserId() userId: string) : any {
    return this.tasksService.getScheduledMessages(userId);
  }

  @Get('messages/history')
  getMessageHistory(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 100);
    return this.tasksService.getMessageHistory(userId, parsedLimit);
  }

  @Get('scheduled/:id')
  getScheduledMessageById(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
  ) : any {
    return this.tasksService.getScheduledMessageById(userId, id);
  }

  @Get(':id')
  findOne(@CurrentUserId() userId: string, @Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(userId, id, updateTaskDto);
  }

  @Delete(':id')
  remove(@CurrentUserId() userId: string, @Param('id', ParseIntPipe) id: number) {
    return this.tasksService.remove(userId, id);
  }

  @Post('send-message')
  sendMessage(@CurrentUserId() userId: string, @Body() payload: SendMessagePayloadDto) {
    return this.tasksService.sendMessage(userId, payload);
  }

  @Delete('scheduled/all')
  clearAllScheduledMessages(@CurrentUserId() userId: string) {
    return this.tasksService.clearAllScheduledMessages(userId);
  }

  @Delete('scheduled/:jobName')
  cancelScheduledMessage(@CurrentUserId() userId: string, @Param('jobName') jobName: string) {
    return this.tasksService.cancelScheduledMessage(userId, jobName);
  }

  @Patch('scheduled/:id/action')
  updateScheduledTaskAction(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateScheduledTaskActionDto,
  ) {
    return this.tasksService.updateScheduledTaskAction(userId, id, body.action);
  }

  @Patch('scheduled/:id')
  updateScheduledMessageTask(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateScheduledMessageTaskDto,
  ) : any {
    return this.tasksService.updateScheduledMessageTask(userId, id, body);
  }
}
