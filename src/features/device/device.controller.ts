import { Controller, Get, Post } from '@nestjs/common';
import { DeviceService } from './device.service';

@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get('login')
  getLoginQr() {
    return this.deviceService.getLoginQr();
  }

  @Post('login')
  postLoginQr() {
    return this.deviceService.getLoginQr();
  }

  @Get('logout')
  getLogoutDevice() {
    return this.deviceService.logoutDevice();
  }

  @Post('logout')
  postLogoutDevice() {
    return this.deviceService.logoutDevice();
  }
}
