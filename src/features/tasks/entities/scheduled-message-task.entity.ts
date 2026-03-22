import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'scheduled_message_tasks' })
export class ScheduledMessageTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120, unique: true })
  jobName: string;

  @Column({ default: true })
  isForwarded: boolean;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'int', unsigned: true })
  frequencyInMinutes: number;

  @Column({ type: 'simple-json' })
  recipients: Array<{ name: string; phone: string }>;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'datetime', nullable: true })
  deactivatedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  lastRunAt?: Date;

  @Column({ type: 'int', unsigned: true, default: 0 })
  runsCount: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
