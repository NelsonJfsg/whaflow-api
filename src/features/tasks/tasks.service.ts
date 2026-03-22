import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SendMessagePayloadDto } from './dto/send-message-payload.dto';
import { Task } from './entities/task.entity';
import { ScheduledMessageTask } from './entities/scheduled-message-task.entity';
import { MessageDispatchLog } from './entities/message-dispatch-log.entity';

interface DispatchPayload {
  is_forwarded: boolean;
  message: string;
  frequency: number;
  recipients: Array<{ name: string; phone: string }>;
}

interface SendWindow {
  start: string;
  end: string;
}

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);
  private readonly scheduledPrefix = 'scheduled-message-';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(ScheduledMessageTask)
    private readonly scheduledTasksRepository: Repository<ScheduledMessageTask>,
    @InjectRepository(MessageDispatchLog)
    private readonly dispatchLogsRepository: Repository<MessageDispatchLog>,
  ) {}

  async onModuleInit() {
    await this.restoreActiveSchedules();
  }

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const task = this.tasksRepository.create(createTaskDto);
    return this.tasksRepository.save(task);
  }

  findAll(): Promise<Task[]> {
    return this.tasksRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Task> {
    const task = await this.tasksRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    return task;
  }

  async update(id: number, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);
    this.tasksRepository.merge(task, updateTaskDto);
    return this.tasksRepository.save(task);
  }

  async remove(id: number): Promise<{ id: number; deleted: boolean }> {
    const task = await this.findOne(id);
    await this.tasksRepository.remove(task);

    return {
      id,
      deleted: true,
    };
  }

  async sendMessage(payload: SendMessagePayloadDto) {
    if (payload.frequency === 0) {
      return this.processMessageDispatch(payload);
    }

    return this.createAndScheduleMessageTask(payload);
  }

  async getMessageHistory(limit = 100) {
    const take = Number.isFinite(limit)
      ? Math.max(1, Math.min(500, Math.trunc(limit)))
      : 100;

    const logs = await this.dispatchLogsRepository.find({
      order: { id: 'DESC' },
      take,
    });

    return {
      total: logs.length,
      logs,
    };
  }

  async getScheduledMessages() {
    const tasks = await this.scheduledTasksRepository.find({
      order: { createdAt: 'DESC' },
    });

    return {
      total: tasks.length,
      tasks: tasks.map((task) => {
        const sendWindow = this.parseSendWindowFromJobName(task.jobName);

        return {
          id: task.id,
          jobName: task.jobName,
          is_forwarded: task.isForwarded,
          message: task.message,
          frequencyInMinutes: task.frequencyInMinutes,
          recipients: task.recipients,
          send_window: sendWindow,
          createdAt: task.createdAt,
          lastRunAt: task.lastRunAt,
          runsCount: task.runsCount,
          lastError: task.lastError,
          isActive: task.isActive,
          deactivatedAt: task.deactivatedAt,
        };
      }),
    };
  }

  async cancelScheduledMessage(jobName: string) {
    const task = await this.scheduledTasksRepository.findOne({
      where: { jobName },
    });

    if (!task) {
      throw new NotFoundException(`Scheduled task with jobName ${jobName} not found`);
    }

    return this.updateScheduledTaskAction(task.id, 'deactivate');
  }

  async updateScheduledTaskAction(
    id: number,
    action: 'activate' | 'deactivate' | 'delete',
  ) {
    const task = await this.scheduledTasksRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Scheduled task with id ${id} not found`);
    }

    if (action === 'activate') {
      if (task.isActive) {
        this.registerScheduledInterval(task);

        return {
          message: 'Scheduled message task is already active',
          id: task.id,
          action,
          updated: false,
        };
      }

      task.isActive = true;
      task.deactivatedAt = undefined;
      await this.scheduledTasksRepository.save(task);
      this.registerScheduledInterval(task);

      return {
        message: 'Scheduled message task activated',
        id: task.id,
        action,
        updated: true,
      };
    }

    this.removeIntervalIfExists(task.jobName);

    if (action === 'deactivate') {
      if (!task.isActive) {
        return {
          message: 'Scheduled message task is already deactivated',
          id: task.id,
          action,
          updated: false,
        };
      }

      task.isActive = false;
      task.deactivatedAt = new Date();
      await this.scheduledTasksRepository.save(task);

      return {
        message: 'Scheduled message task deactivated',
        id: task.id,
        action,
        updated: true,
      };
    }

    await this.scheduledTasksRepository.remove(task);

    return {
      message: 'Scheduled message task deleted',
      id,
      action,
      deleted: true,
    };
  }

  async clearAllScheduledMessages() {
    const tasks = await this.scheduledTasksRepository.find();

    for (const task of tasks) {
      this.removeIntervalIfExists(task.jobName);
    }

    await this.scheduledTasksRepository.remove(tasks);

    return {
      message: 'Scheduled message tasks cleared',
      removed: tasks.length,
    };
  }

  private async createAndScheduleMessageTask(payload: SendMessagePayloadDto) {
    const sendWindow = payload.send_window;

    const newTask = this.scheduledTasksRepository.create({
      jobName: `${this.scheduledPrefix}pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      isForwarded: payload.is_forwarded,
      message: payload.message,
      frequencyInMinutes: payload.frequency,
      recipients: payload.recipients.map((recipient) => ({ ...recipient })),
      isActive: true,
      runsCount: 0,
    });

    let savedTask = await this.scheduledTasksRepository.save(newTask);
    savedTask.jobName = this.buildJobName(savedTask.id, sendWindow);
    savedTask = await this.scheduledTasksRepository.save(savedTask);

    let firstDispatchResult;

    try {
      if (this.isWithinSendWindow(sendWindow, new Date())) {
        firstDispatchResult = await this.processMessageDispatch(payload, savedTask);
      } else {
        firstDispatchResult = {
          skipped: true,
          reason: 'Current time is outside send_window',
          send_window: sendWindow,
        };
      }
    } catch (error) {
      savedTask.isActive = false;
      savedTask.deactivatedAt = new Date();
      savedTask.lastError = error instanceof Error ? error.message : String(error);
      await this.scheduledTasksRepository.save(savedTask);
      throw error;
    }

    this.registerScheduledInterval(savedTask);

    return {
      message: 'Scheduled message task created',
      id: savedTask.id,
      jobName: savedTask.jobName,
      frequencyInMinutes: payload.frequency,
      send_window: sendWindow,
      firstDispatch: firstDispatchResult,
      recipients: payload.recipients.length,
    };
  }

  private async processMessageDispatch(
    payload: DispatchPayload,
    scheduledTask?: ScheduledMessageTask,
  ) {
    const externalMessageUrl =
      this.configService.get<string>('TASKS_EXTERNAL_MESSAGE_URL') ??
      'http://localhost:3000/send/message';
    const authToken = this.configService.get<string>('TASKS_AUTH_TOKEN') ?? '';

    const results = await Promise.allSettled(
      payload.recipients.map(async (recipient) => {
        try {
          const response = await firstValueFrom(
            this.httpService.post(
              externalMessageUrl,
              {
                phone: recipient.phone,
                is_forwarded: payload.is_forwarded,
                message: payload.message,
              },
              {
                headers: {
                  Authorization: authToken,
                },
              },
            ),
          );

          await this.dispatchLogsRepository.save(
            this.dispatchLogsRepository.create({
              scheduledTaskId: scheduledTask?.id,
              recipientName: recipient.name,
              recipientPhone: recipient.phone,
              isForwarded: payload.is_forwarded,
              message: payload.message,
              frequencyInMinutes: payload.frequency,
              status: 'SUCCESS',
              statusCode: response.status,
              responseBody: response.data,
            }),
          );

          return {
            recipient,
            statusCode: response.status,
            response: response.data,
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : `Unknown error sending message to ${recipient.phone}`;

          await this.dispatchLogsRepository.save(
            this.dispatchLogsRepository.create({
              scheduledTaskId: scheduledTask?.id,
              recipientName: recipient.name,
              recipientPhone: recipient.phone,
              isForwarded: payload.is_forwarded,
              message: payload.message,
              frequencyInMinutes: payload.frequency,
              status: 'FAILED',
              error: message,
            }),
          );

          this.logger.error(
            `Error sending message to ${recipient.name} (${recipient.phone})`,
            error instanceof Error ? error.stack : String(error),
          );

          throw new Error(
            `Failed to send message to ${recipient.name} (${recipient.phone}): ${message}`,
          );
        }
      }),
    );

    const success = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    const failed = results
      .filter((result) => result.status === 'rejected')
      .map((result) => ({
        error:
          result.reason instanceof Error ? result.reason.message : String(result.reason),
      }));

    if (scheduledTask) {
      scheduledTask.lastRunAt = new Date();
      scheduledTask.runsCount += 1;
      scheduledTask.lastError = failed.length > 0 ? failed[0].error : undefined;
      await this.scheduledTasksRepository.save(scheduledTask);
    }

    if (success.length === 0) {
      throw new BadGatewayException({
        message: 'Could not forward any recipient payloads',
        failed,
      });
    }

    return {
      is_forwarded: payload.is_forwarded,
      message: payload.message,
      frequency: payload.frequency,
      total: payload.recipients.length,
      forwarded: success.length,
      failed: failed.length,
      success,
      errors: failed,
    };
  }

  private registerScheduledInterval(task: ScheduledMessageTask) {
    this.removeIntervalIfExists(task.jobName);

    const intervalInMs = task.frequencyInMinutes * 60_000;

    const interval = setInterval(() => {
      void this.executeScheduledTask(task.id);
    }, intervalInMs);

    this.schedulerRegistry.addInterval(task.jobName, interval);
  }

  private async executeScheduledTask(taskId: number) {
    const task = await this.scheduledTasksRepository.findOne({ where: { id: taskId } });

    if (!task || !task.isActive) {
      if (task) {
        this.removeIntervalIfExists(task.jobName);
      }
      return;
    }

    const sendWindow = this.parseSendWindowFromJobName(task.jobName);

    if (!this.isWithinSendWindow(sendWindow, new Date())) {
      return;
    }

    try {
      await this.processMessageDispatch(
        {
          is_forwarded: task.isForwarded,
          message: task.message,
          frequency: task.frequencyInMinutes,
          recipients: task.recipients,
        },
        task,
      );
    } catch (error) {
      this.logger.error(
        `Scheduled job ${task.jobName} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async restoreActiveSchedules() {
    const activeTasks = await this.scheduledTasksRepository.find({
      where: { isActive: true },
    });

    for (const task of activeTasks) {
      this.registerScheduledInterval(task);
    }
  }

  private removeIntervalIfExists(jobName: string) {
    if (this.schedulerRegistry.doesExist('interval', jobName)) {
      this.schedulerRegistry.deleteInterval(jobName);
    }
  }

  private buildJobName(taskId: number, sendWindow?: SendWindow): string {
    const baseJobName = `${this.scheduledPrefix}${taskId}`;

    if (!sendWindow) {
      return baseJobName;
    }

    const compactStart = sendWindow.start.replace(':', '');
    const compactEnd = sendWindow.end.replace(':', '');

    return `${baseJobName}__w${compactStart}-${compactEnd}`;
  }

  private parseSendWindowFromJobName(jobName: string): SendWindow | undefined {
    const match = /__w(\d{4})-(\d{4})$/.exec(jobName);

    if (!match) {
      return undefined;
    }

    const [, startRaw, endRaw] = match;

    return {
      start: `${startRaw.slice(0, 2)}:${startRaw.slice(2)}`,
      end: `${endRaw.slice(0, 2)}:${endRaw.slice(2)}`,
    };
  }

  private isWithinSendWindow(sendWindow: SendWindow | undefined, date: Date): boolean {
    if (!sendWindow) {
      return true;
    }

    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    const startMinutes = this.timeToMinutes(sendWindow.start);
    const endMinutes = this.timeToMinutes(sendWindow.end);

    if (startMinutes === endMinutes) {
      return true;
    }

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
