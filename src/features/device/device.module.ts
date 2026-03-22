import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceController } from './device.controller';
import { DeviceRegistration } from './entities/device-registration.entity';
import { DeviceService } from './device.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([DeviceRegistration])],
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}
