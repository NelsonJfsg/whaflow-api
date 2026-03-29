import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceRegistration } from '../device/entities/device-registration.entity';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([DeviceRegistration])],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
