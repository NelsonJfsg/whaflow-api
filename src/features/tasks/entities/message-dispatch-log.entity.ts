import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ScheduledMessageTask } from './scheduled-message-task.entity';

export type DispatchStatus = 'SUCCESS' | 'FAILED';

@Entity({ name: 'message_dispatch_logs' })
export class MessageDispatchLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  scheduledTaskId?: number;

  @ManyToOne(() => ScheduledMessageTask, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scheduledTaskId' })
  scheduledTask?: ScheduledMessageTask;

  @Column({ length: 120, nullable: true })
  recipientName?: string;

  @Column({ length: 40 })
  recipientPhone: string;

  @Column({ default: true })
  isForwarded: boolean;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  frequencyInMinutes: number;

  @Column({ type: 'varchar', length: 20 })
  status: DispatchStatus;

  @Column({ type: 'int', nullable: true })
  statusCode?: number;

  @Column({ type: 'simple-json', nullable: true })
  responseBody?: unknown;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
