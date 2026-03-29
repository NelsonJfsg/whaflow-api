import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { DeviceRegistration } from '../device/entities/device-registration.entity';
import { GroupsApiResponse, MyGroupsResponse } from './interfaces/groups-response.interface';

@Injectable()
export class GroupsService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(DeviceRegistration)
    private readonly deviceRegistrationRepository: Repository<DeviceRegistration>,
  ) {}

  async getMyGroups(userId: string): Promise<MyGroupsResponse> {
    const externalGroupsUrl =
      this.configService.get<string>('GROUPS_EXTERNAL_URL') ??
      'http://localhost:3000/user/my/groups';
    const authToken = this.configService.get<string>('AUTH_TOKEN') ?? '';
    const deviceId = await this.resolveActiveDeviceId(userId);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GroupsApiResponse>(externalGroupsUrl, {
          headers: {
            Authorization: authToken,
            ...(deviceId ? { 'X-Device-Id': deviceId } : {}),
          },
        }),
      );

      const groups = response.data.results?.data ?? [];

      return {
        code: response.data.code,
        message: response.data.message,
        total: groups.length,
        groups,
      };
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException({
        code: 'GROUPS_PROVIDER_ERROR',
        message: 'Could not retrieve groups from external provider',
        details,
      });
    }
  }

  private async resolveActiveDeviceId(userId: string): Promise<string | undefined> {
    const registration = await this.deviceRegistrationRepository.findOne({
      where: { ownerUserId: userId, isActive: true },
      order: { id: 'DESC' },
    });

    return registration?.externalDeviceId;
  }
}
