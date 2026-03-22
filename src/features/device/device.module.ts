import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

@Module({
  imports: [HttpModule],
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}
