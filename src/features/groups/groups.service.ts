import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { GroupsApiResponse, MyGroupsResponse } from './interfaces/groups-response.interface';

@Injectable()
export class GroupsService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getMyGroups(): Promise<MyGroupsResponse> {
    const externalGroupsUrl =
      this.configService.get<string>('GROUPS_EXTERNAL_URL') ??
      'http://localhost:3000/user/my/groups';
    const authToken = this.configService.get<string>('TASKS_AUTH_TOKEN') ?? '';

    try {
      const response = await firstValueFrom(
        this.httpService.get<GroupsApiResponse>(externalGroupsUrl, {
          headers: {
            Authorization: authToken,
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
}
