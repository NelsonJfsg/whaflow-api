import { Controller, Get, Post } from '@nestjs/common';
import { DeviceService } from './device.service';
import { CurrentUserId } from '../../shared/decorators/current-user-id.decorator';

@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get('login')
  getLoginQr(@CurrentUserId() userId: string) {
    return this.deviceService.getLoginQr(userId);
  }

  @Post('login')
  postLoginQr(@CurrentUserId() userId: string) {
    return this.deviceService.getLoginQr(userId);
  }

  @Get('logout')
  getLogoutDevice(@CurrentUserId() userId: string) {
    return this.deviceService.logoutDevice(userId);
  }

  @Post('logout')
  postLogoutDevice(@CurrentUserId() userId: string) {
    return this.deviceService.logoutDevice(userId);
  }
}
