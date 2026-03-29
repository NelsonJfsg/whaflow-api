import {
  BadRequestException,
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
import { UpdateScheduledMessageTaskDto } from './dto/update-scheduled-message-task.dto';
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
  start_at?: string;
}

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);
  private readonly scheduledPrefix = 'scheduled-message-';
  private readonly dispatcherJobName = 'scheduled-message-dispatcher';
  private readonly dispatcherTickMs = 15_000;
  private readonly dispatchVisualSafetyMs: number;
  private readonly runningTaskIds = new Set<number>();
  private isDispatchCycleRunning = false;

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
  ) {
    this.dispatchVisualSafetyMs = this.resolveDispatchVisualSafetyMs();
  }

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
        const sendWindow = this.getSendWindowFromTask(task);

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
          isWindowEnabled: task.isWindowEnabled,
          isDispatchEnabled: task.isActive && task.isWindowEnabled,
          deactivatedAt: task.deactivatedAt,
        };
      }),
    };
  }

  async getScheduledMessageById(id: number) {
    const task = await this.scheduledTasksRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Scheduled task with id ${id} not found`);
    }

    const sendWindow = this.getSendWindowFromTask(task);

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
      isWindowEnabled: task.isWindowEnabled,
      isDispatchEnabled: task.isActive && task.isWindowEnabled,
      deactivatedAt: task.deactivatedAt,
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
      task.isWindowEnabled = this.isWithinSendWindow(this.getSendWindowFromTask(task), new Date());
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

  async updateScheduledMessageTask(id: number, updates: UpdateScheduledMessageTaskDto) {
    const task = await this.scheduledTasksRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Scheduled task with id ${id} not found`);
    }

    const mergedWindow = this.mergeSendWindowUpdate(this.getSendWindowFromTask(task), updates);
    this.validateAnchoredStartTime(mergedWindow);

    if (updates.is_forwarded !== undefined) {
      task.isForwarded = updates.is_forwarded;
    }

    if (updates.message !== undefined) {
      task.message = updates.message;
    }

    if (updates.frequency !== undefined) {
      task.frequencyInMinutes = updates.frequency;
    }

    if (updates.recipients !== undefined) {
      task.recipients = updates.recipients.map((recipient) => ({ ...recipient }));
    }

    if (mergedWindow) {
      task.sendWindowStart = mergedWindow.start;
      task.sendWindowEnd = mergedWindow.end;
      task.sendWindowStartAt = mergedWindow.start_at;
    }

    const now = new Date();
    task.isWindowEnabled = this.isWithinSendWindow(this.getSendWindowFromTask(task), now);

    const updatedTask = await this.scheduledTasksRepository.save(task);
    this.registerScheduledInterval(updatedTask);

    return {
      message: 'Scheduled message task updated',
      id: updatedTask.id,
      jobName: updatedTask.jobName,
      is_forwarded: updatedTask.isForwarded,
      frequencyInMinutes: updatedTask.frequencyInMinutes,
      send_window: this.getSendWindowFromTask(updatedTask),
      recipients: updatedTask.recipients,
      isActive: updatedTask.isActive,
      isWindowEnabled: updatedTask.isWindowEnabled,
    };
  }

  private async createAndScheduleMessageTask(payload: SendMessagePayloadDto) {
    const sendWindow = payload.send_window;
    this.validateAnchoredStartTime(sendWindow);
    const now = new Date();

    const newTask = this.scheduledTasksRepository.create({
      jobName: `${this.scheduledPrefix}pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      isForwarded: payload.is_forwarded,
      message: payload.message,
      frequencyInMinutes: payload.frequency,
      recipients: payload.recipients.map((recipient) => ({ ...recipient })),
      sendWindowStart: sendWindow?.start,
      sendWindowEnd: sendWindow?.end,
      sendWindowStartAt: sendWindow?.start_at,
      isActive: true,
      isWindowEnabled: this.isWithinSendWindow(sendWindow, now),
      runsCount: 0,
    });

    let savedTask = await this.scheduledTasksRepository.save(newTask);
    savedTask.jobName = `${this.scheduledPrefix}${savedTask.id}`;
    savedTask = await this.scheduledTasksRepository.save(savedTask);

    let firstDispatchResult;

    try {
      if (this.shouldDispatchTaskNow(savedTask, now)) {
        firstDispatchResult = await this.processMessageDispatch(payload, savedTask);
      } else {
        const hasAnchoredStart = Boolean(sendWindow?.start_at);

        firstDispatchResult = {
          skipped: true,
          reason:
            !savedTask.isWindowEnabled
              ? 'Current time is outside send_window'
              : hasAnchoredStart
                ? 'Current time does not match send_window.start_at frequency slot yet'
                : 'Scheduled task is waiting for the next frequency slot',
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
    const authToken = this.configService.get<string>('AUTH_TOKEN') ?? '';

    const results: Array<
      | {
          status: 'fulfilled';
          value: {
            recipient: { name: string; phone: string };
            statusCode: number;
            response: unknown;
          };
        }
      | {
          status: 'rejected';
          reason: Error;
        }
    > = [];

    for (const recipient of payload.recipients) {
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

        results.push({
          status: 'fulfilled',
          value: {
            recipient,
            statusCode: response.status,
            response: response.data,
          },
        });
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

        results.push({
          status: 'rejected',
          reason: new Error(
            `Failed to send message to ${recipient.name} (${recipient.phone}): ${message}`,
          ),
        });
      }
    }

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
    this.ensureDispatcherRunning();
  }

  private async executeScheduledTask(taskId: number) {
    if (this.runningTaskIds.has(taskId)) {
      this.logger.warn(`Skipping task ${taskId} because a previous run is still in progress`);
      return;
    }

    this.runningTaskIds.add(taskId);

    const task = await this.scheduledTasksRepository.findOne({ where: { id: taskId } });

    try {
      if (!task || !task.isActive) {
        if (task) {
          this.removeIntervalIfExists(task.jobName);
        }
        return;
      }

      if (!this.shouldDispatchTaskNow(task, new Date())) {
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
    } finally {
      this.runningTaskIds.delete(taskId);
    }
  }

  private async restoreActiveSchedules() {
    this.cleanupLegacyTaskIntervals();
    this.ensureDispatcherRunning();
  }

  private ensureDispatcherRunning() {
    if (this.schedulerRegistry.doesExist('interval', this.dispatcherJobName)) {
      return;
    }

    const interval = setInterval(() => {
      void this.runDueScheduledTasks();
    }, this.dispatcherTickMs);

    this.schedulerRegistry.addInterval(this.dispatcherJobName, interval);
    void this.runDueScheduledTasks();
  }

  private async runDueScheduledTasks() {
    if (this.isDispatchCycleRunning) {
      return;
    }

    this.isDispatchCycleRunning = true;

    try {
      const activeTasks = await this.scheduledTasksRepository.find({
        where: { isActive: true },
        order: { id: 'ASC' },
      });

      const now = new Date();
      await this.syncWindowEnabledStates(activeTasks, now);

      for (const task of activeTasks) {
        if (!this.shouldDispatchTaskNow(task, now)) {
          continue;
        }

        await this.executeScheduledTask(task.id);
      }
    } finally {
      this.isDispatchCycleRunning = false;
    }
  }

  private shouldDispatchTaskNow(task: ScheduledMessageTask, now: Date): boolean {
    if (!task.isWindowEnabled) {
      return false;
    }

    const sendWindow = this.getSendWindowFromTask(task);

    if (sendWindow?.start_at) {
      return this.shouldDispatchAnchoredTaskNow(task, now, sendWindow);
    }

    if (!task.lastRunAt) {
      return true;
    }

    const elapsedMs = now.getTime() - new Date(task.lastRunAt).getTime();
    return elapsedMs >= task.frequencyInMinutes * 60_000;
  }

  private async syncWindowEnabledStates(tasks: ScheduledMessageTask[], now: Date) {
    const changedTasks: ScheduledMessageTask[] = [];

    for (const task of tasks) {
      const shouldEnable = this.isWithinSendWindow(this.getSendWindowFromTask(task), now);

      if (task.isWindowEnabled !== shouldEnable) {
        task.isWindowEnabled = shouldEnable;
        changedTasks.push(task);
      }
    }

    if (changedTasks.length > 0) {
      await this.scheduledTasksRepository.save(changedTasks);
    }
  }

  private getSendWindowFromTask(task: ScheduledMessageTask): SendWindow | undefined {
    if (task.sendWindowStart && task.sendWindowEnd) {
      return {
        start: task.sendWindowStart,
        end: task.sendWindowEnd,
        start_at: task.sendWindowStartAt,
      };
    }

    return this.parseSendWindowFromJobName(task.jobName);
  }

  private cleanupLegacyTaskIntervals() {
    const intervals = this.schedulerRegistry.getIntervals();

    for (const intervalName of intervals) {
      if (
        intervalName.startsWith(this.scheduledPrefix) &&
        intervalName !== this.dispatcherJobName
      ) {
        this.schedulerRegistry.deleteInterval(intervalName);
      }
    }
  }

  private removeIntervalIfExists(jobName: string) {
    if (this.schedulerRegistry.doesExist('interval', jobName)) {
      this.schedulerRegistry.deleteInterval(jobName);
    }
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

  private shouldDispatchAnchoredTaskNow(
    task: ScheduledMessageTask,
    now: Date,
    sendWindow: SendWindow,
  ): boolean {
    const anchorTime = sendWindow.start_at;

    if (!anchorTime || task.frequencyInMinutes <= 0) {
      return false;
    }

    const bounds = this.getCurrentWindowBounds(sendWindow, now);

    if (!bounds) {
      return false;
    }

    const anchorDate = this.buildAnchorDate(bounds.start, bounds.end, anchorTime);

    if (!anchorDate || now.getTime() < anchorDate.getTime()) {
      return false;
    }

    const frequencyMs = task.frequencyInMinutes * 60_000;
    const elapsedMs = now.getTime() - anchorDate.getTime();
    const toleranceMs = Math.min(this.dispatcherTickMs * 2, frequencyMs);
    const remainderMs = elapsedMs % frequencyMs;

    if (remainderMs > toleranceMs) {
      return false;
    }

    const slotStart = new Date(now.getTime() - remainderMs);

    // Avoid boundary-second drift where downstream clients can render the previous minute.
    if (now.getTime() < slotStart.getTime() + this.dispatchVisualSafetyMs) {
      return false;
    }

    if (slotStart.getTime() > bounds.end.getTime()) {
      return false;
    }

    if (!task.lastRunAt) {
      return true;
    }

    return new Date(task.lastRunAt).getTime() < slotStart.getTime();
  }

  private getCurrentWindowBounds(
    sendWindow: SendWindow,
    now: Date,
  ): { start: Date; end: Date } | undefined {
    const startMinutes = this.timeToMinutes(sendWindow.start);
    const endMinutes = this.timeToMinutes(sendWindow.end);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (startMinutes === endMinutes) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      return { start, end };
    }

    if (startMinutes < endMinutes) {
      const start = this.dateWithMinutes(now, startMinutes);
      const end = this.dateWithMinutes(now, endMinutes);
      return { start, end };
    }

    if (currentMinutes >= startMinutes) {
      const start = this.dateWithMinutes(now, startMinutes);
      const end = this.dateWithMinutes(this.addDays(now, 1), endMinutes);
      return { start, end };
    }

    if (currentMinutes <= endMinutes) {
      const start = this.dateWithMinutes(this.addDays(now, -1), startMinutes);
      const end = this.dateWithMinutes(now, endMinutes);
      return { start, end };
    }

    return undefined;
  }

  private buildAnchorDate(windowStart: Date, windowEnd: Date, anchorTime: string): Date | undefined {
    const anchorDate = this.dateWithMinutes(windowStart, this.timeToMinutes(anchorTime));

    if (anchorDate.getTime() < windowStart.getTime()) {
      anchorDate.setDate(anchorDate.getDate() + 1);
    }

    if (anchorDate.getTime() > windowEnd.getTime()) {
      return undefined;
    }

    return anchorDate;
  }

  private validateAnchoredStartTime(sendWindow?: SendWindow) {
    if (!sendWindow?.start_at) {
      return;
    }

    const isInside = this.isTimeWithinWindow(sendWindow.start_at, sendWindow.start, sendWindow.end);

    if (!isInside) {
      throw new BadRequestException(
        'send_window.start_at must be within the send_window start/end range',
      );
    }
  }

  private mergeSendWindowUpdate(
    currentWindow: SendWindow | undefined,
    updates: UpdateScheduledMessageTaskDto,
  ): SendWindow | undefined {
    if (!updates.send_window) {
      return currentWindow;
    }

    const mergedStart = updates.send_window.start ?? currentWindow?.start;
    const mergedEnd = updates.send_window.end ?? currentWindow?.end;

    if (!mergedStart || !mergedEnd) {
      throw new BadRequestException(
        'send_window updates require both start and end values when no existing send_window is set',
      );
    }

    return {
      start: mergedStart,
      end: mergedEnd,
      start_at: updates.send_window.start_at ?? currentWindow?.start_at,
    };
  }

  private isTimeWithinWindow(time: string, start: string, end: string): boolean {
    const targetMinutes = this.timeToMinutes(time);
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);

    if (startMinutes === endMinutes) {
      return true;
    }

    if (startMinutes < endMinutes) {
      return targetMinutes >= startMinutes && targetMinutes <= endMinutes;
    }

    return targetMinutes >= startMinutes || targetMinutes <= endMinutes;
  }

  private dateWithMinutes(base: Date, totalMinutes: number): Date {
    const date = new Date(base);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  private addDays(base: Date, days: number): Date {
    const date = new Date(base);
    date.setDate(date.getDate() + days);
    return date;
  }

  private resolveDispatchVisualSafetyMs(): number {
    const rawValue = this.configService.get<string>('DISPATCH_VISUAL_SAFETY_MS');

    if (!rawValue) {
      return 10_000;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      this.logger.warn(
        `Invalid DISPATCH_VISUAL_SAFETY_MS value: ${rawValue}. Falling back to 10000ms.`,
      );
      return 10_000;
    }

    return Math.floor(parsedValue);
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
