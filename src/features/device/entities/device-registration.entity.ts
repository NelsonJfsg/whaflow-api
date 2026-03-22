import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'device_registrations' })
export class DeviceRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120, unique: true })
  externalDeviceId: string;

  @Column({ length: 150, nullable: true })
  displayName?: string;

  @Column({ length: 150, nullable: true })
  jid?: string;

  @Column({ length: 50, nullable: true })
  providerState?: string;

  @Column({ type: 'datetime', nullable: true })
  providerCreatedAt?: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
