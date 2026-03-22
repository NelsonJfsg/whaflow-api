import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import {
  DeviceBootstrapApiResponse,
  DeviceLoginApiResponse,
  DeviceLoginResponse,
} from './interfaces/device-response.interface';
import { DeviceRegistration } from './entities/device-registration.entity';

@Injectable()
export class DeviceService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(DeviceRegistration)
    private readonly deviceRegistrationRepository: Repository<DeviceRegistration>,
  ) {}

  async getLoginQr(): Promise<DeviceLoginResponse> {
    const externalDevicesUrl =
      this.configService.get<string>('DEVICE_EXTERNAL_URL') ??
      'http://localhost:3000/devices';
    const externalLoginUrl =
      this.configService.get<string>('DEVICE_LOGIN_EXTERNAL_URL') ??
      'http://localhost:3000/app/login';
    const authToken =
      this.configService.get<string>('DEVICE_AUTH_TOKEN') ??
      this.configService.get<string>('TASKS_AUTH_TOKEN') ??
      this.configService.get<string>('AUTH_TOKEN') ??
      '';

    try {
      const registeredDevice = await this.findOrCreateDeviceRegistration(
        externalDevicesUrl,
        authToken,
      );
      const bootstrapDeviceId = registeredDevice.externalDeviceId;

      const response = await this.requestDeviceLogin(
        externalLoginUrl,
        authToken,
        bootstrapDeviceId,
      );

      const { code, message, results } = response.data;
      const deviceId = results?.device_id ?? bootstrapDeviceId;
      const qrDuration = results?.qr_duration ?? 0;
      const qrLink = results?.qr_link ?? '';

      let qr_png_base64: string | undefined;

      if (qrLink) {
        const qrResponse = await firstValueFrom(
          this.httpService.get<ArrayBuffer>(qrLink, {
            responseType: 'arraybuffer',
          }),
        );

        const contentType = qrResponse.headers['content-type'] ?? 'image/png';
        const pngBuffer = Buffer.from(qrResponse.data);
        qr_png_base64 = `data:${contentType};base64,${pngBuffer.toString('base64')}`;
      }

      return {
        code,
        message,
        results: {
          device_id: deviceId,
          qr_duration: qrDuration,
          qr_link: qrLink,
          qr_png_base64,
        },
      };
    } catch (error) {
      console.log('getLoginQr error:', error);
      const details = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException({
        code: 'DEVICE_LOGIN_PROVIDER_ERROR',
        message: 'Could not retrieve device login QR from external provider',
        details,
      });
    }
  }

  private async requestDeviceLogin(
    externalLoginUrl: string,
    authToken: string,
    deviceId: string,
  ) {
    const requestConfig = {
      headers: {
        Authorization: authToken,
        'X-Device-Id': deviceId,
      },
      params: {
        device_id: deviceId,
      },
    };

    try {
      return await firstValueFrom(
        this.httpService.post<DeviceLoginApiResponse>(
          externalLoginUrl,
          {},
          requestConfig,
        ),
      );
    } catch (postError) {
      const axiosPostError = postError as AxiosError;
      const status = axiosPostError.response?.status;

      if (status === 400 || status === 404 || status === 405) {
        return firstValueFrom(
          this.httpService.get<DeviceLoginApiResponse>(externalLoginUrl, requestConfig),
        );
      }

      throw postError;
    }
  }

  private async findOrCreateDeviceRegistration(
    externalDevicesUrl: string,
    authToken: string,
  ): Promise<DeviceRegistration> {
    const existingDevice = await this.deviceRegistrationRepository.findOne({
      where: { isActive: true },
      order: { id: 'DESC' },
    });

    if (existingDevice) {
      return existingDevice;
    }

    const bootstrapResponse = await firstValueFrom(
      this.httpService.post<DeviceBootstrapApiResponse>(
        externalDevicesUrl,
        {},
        {
          headers: {
            Authorization: authToken,
          },
        },
      ),
    );

    const bootstrapDevice = bootstrapResponse.data.results;
    const bootstrapDeviceId = bootstrapDevice?.id ?? '';

    if (!bootstrapDeviceId) {
      throw new BadGatewayException({
        code: 'DEVICE_BOOTSTRAP_PROVIDER_ERROR',
        message: 'Could not get device id from external provider',
        details: bootstrapResponse.data,
      });
    }

    const newDeviceRegistration = this.deviceRegistrationRepository.create({
      externalDeviceId: bootstrapDeviceId,
      displayName: bootstrapDevice?.display_name ?? '',
      jid: bootstrapDevice?.jid ?? '',
      providerState: bootstrapDevice?.state ?? '',
      providerCreatedAt: bootstrapDevice?.created_at
        ? new Date(bootstrapDevice.created_at)
        : undefined,
      isActive: true,
    });

    return this.deviceRegistrationRepository.save(newDeviceRegistration);
  }
}
