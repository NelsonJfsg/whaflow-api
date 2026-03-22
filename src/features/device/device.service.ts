import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import {
  DeviceBootstrapApiResponse,
  DeviceListApiResponse,
  DeviceLoginApiResponse,
  DeviceLoginResponse,
  DeviceLogoutApiResponse,
  DeviceLogoutResponse,
  DeviceProviderDevice,
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
    const authToken = this.resolveAuthToken();

    try {
      const providerDevices = await this.getProviderDevices(externalDevicesUrl, authToken);

      const loggedInProviderDevice = providerDevices.find(
        (device) => (device.state ?? '').toLowerCase() === 'logged_in',
      );

      if (loggedInProviderDevice) {
        const loggedInRegistration = await this.upsertDeviceRegistration(loggedInProviderDevice);

        loggedInRegistration.isLoggedIn = true;
        loggedInRegistration.providerState = loggedInProviderDevice.state ?? 'logged_in';
        loggedInRegistration.sessionJid = loggedInProviderDevice.jid ?? '';
        await this.deviceRegistrationRepository.save(loggedInRegistration);

        return {
          code: 'SUCCESS',
          message: 'Device is ready to use',
          results: {
            device_id: loggedInRegistration.externalDeviceId,
            qr_duration: 0,
            qr_link: '',
            is_ready: true,
            session: {
              state: loggedInRegistration.providerState ?? 'logged_in',
              jid: loggedInRegistration.sessionJid,
            },
          },
        };
      }

      const providerCandidateDevice =
        providerDevices.find((device) => Boolean(device.id)) ?? undefined;

      const registeredDevice = await this.findOrCreateDeviceRegistration(
        externalDevicesUrl,
        authToken,
        providerCandidateDevice,
      );

      if (registeredDevice.isLoggedIn) {
        return {
          code: 'SUCCESS',
          message: 'Device is ready to use',
          results: {
            device_id: registeredDevice.externalDeviceId,
            qr_duration: 0,
            qr_link: '',
            is_ready: true,
            session: {
              state: registeredDevice.providerState ?? 'logged_in',
              jid: registeredDevice.sessionJid ?? registeredDevice.jid,
            },
          },
        };
      }

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

      if (this.isDeviceAlreadyLogged(response.data)) {
        registeredDevice.isLoggedIn = true;
        registeredDevice.providerState = 'logged_in';
        registeredDevice.sessionJid = response.data.results?.jid ?? registeredDevice.jid ?? '';
        await this.deviceRegistrationRepository.save(registeredDevice);

        return {
          code,
          message: 'Device is ready to use',
          results: {
            device_id: deviceId,
            qr_duration: 0,
            qr_link: '',
            is_ready: true,
            session: {
              state: 'logged_in',
              jid: registeredDevice.sessionJid,
            },
          },
        };
      }

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

  async logoutDevice(): Promise<DeviceLogoutResponse> {
    const externalLogoutUrl =
      this.configService.get<string>('DEVICE_LOGOUT_EXTERNAL_URL') ??
      'http://localhost:3000/app/logout';
    const authToken = this.resolveAuthToken();

    const registeredDevice = await this.deviceRegistrationRepository.findOne({
      where: { isActive: true },
      order: { id: 'DESC' },
    });

    if (!registeredDevice) {
      return {
        code: 'SUCCESS',
        message: 'No registered device to logout',
        results: {
          device_id: '',
        },
      };
    }

    try {
      const response = await this.requestDeviceLogout(
        externalLogoutUrl,
        authToken,
        registeredDevice.externalDeviceId,
      );
      const payload = response.data;

      await this.deviceRegistrationRepository.remove(registeredDevice);

      return {
        code: payload.code ?? 'SUCCESS',
        message: payload.message ?? 'Device logout success',
        results: {
          device_id: payload.results?.device_id ?? registeredDevice.externalDeviceId,
        },
      };
    } catch (error) {
      console.log('logoutDevice error:', error);
      const details = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException({
        code: 'DEVICE_LOGOUT_PROVIDER_ERROR',
        message: 'Could not logout device from external provider',
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

  private async requestDeviceLogout(
    externalLogoutUrl: string,
    authToken: string,
    deviceId: string,
  ) {
    const requestConfig = {
      headers: {
        Authorization: authToken,
        'X-Device-Id': deviceId,
      },
    };

    try {
      // Match the known-good request: GET + Authorization + X-Device-Id.
      return await firstValueFrom(
        this.httpService.get<DeviceLogoutApiResponse>(
          externalLogoutUrl,
          requestConfig,
        ),
      );
    } catch (getError) {
      const axiosGetError = getError as AxiosError;
      const status = axiosGetError.response?.status;

      if (status === 400 || status === 404 || status === 405 || status === 401) {
        return firstValueFrom(
          this.httpService.post<DeviceLogoutApiResponse>(
            externalLogoutUrl,
            {},
            {
              ...requestConfig,
              params: {
                device_id: deviceId,
              },
            },
          ),
        );
      }

      throw getError;
    }
  }

  private resolveAuthToken(): string {
    const token = this.configService.get<string>('AUTH_TOKEN') ?? '';
    return token.trim();
  }

  private isDeviceAlreadyLogged(payload: DeviceLoginApiResponse): boolean {
    const message = (payload.message ?? '').toLowerCase();
    const status = (payload.results?.status ?? '').toLowerCase();

    return (
      payload.results?.is_logged === true ||
      payload.results?.is_ready === true ||
      status === 'connected' ||
      status === 'ready' ||
      message.includes('already logged') ||
      message.includes('already login') ||
      message.includes('logged in') ||
      message.includes('ready to use') ||
      message.includes('device ready')
    );
  }

  private async findOrCreateDeviceRegistration(
    externalDevicesUrl: string,
    authToken: string,
    providerCandidateDevice?: DeviceProviderDevice,
  ): Promise<DeviceRegistration> {
    const existingDevice = await this.deviceRegistrationRepository.findOne({
      where: { isActive: true },
      order: { id: 'DESC' },
    });

    if (existingDevice) {
      return existingDevice;
    }

    if (providerCandidateDevice?.id) {
      return this.upsertDeviceRegistration(providerCandidateDevice);
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
      sessionJid: bootstrapDevice?.jid ?? '',
      providerState: bootstrapDevice?.state ?? '',
      providerCreatedAt: bootstrapDevice?.created_at
        ? new Date(bootstrapDevice.created_at)
        : undefined,
      isActive: true,
      isLoggedIn: false,
    });

    return this.deviceRegistrationRepository.save(newDeviceRegistration);
  }

  private async getProviderDevices(
    externalDevicesUrl: string,
    authToken: string,
  ): Promise<DeviceProviderDevice[]> {
    const response = await firstValueFrom(
      this.httpService.get<DeviceListApiResponse>(externalDevicesUrl, {
        headers: {
          Authorization: authToken,
        },
      }),
    );

    return Array.isArray(response.data.results) ? response.data.results : [];
  }

  private async upsertDeviceRegistration(
    providerDevice: DeviceProviderDevice,
  ): Promise<DeviceRegistration> {
    const existing = await this.deviceRegistrationRepository.findOne({
      where: { externalDeviceId: providerDevice.id },
    });

    if (existing) {
      existing.providerState = providerDevice.state ?? existing.providerState;
      existing.jid = providerDevice.jid ?? existing.jid;
      existing.sessionJid = providerDevice.jid ?? existing.sessionJid;
      existing.providerCreatedAt = providerDevice.created_at
        ? new Date(providerDevice.created_at)
        : existing.providerCreatedAt;
      existing.isActive = true;
      return this.deviceRegistrationRepository.save(existing);
    }

    const newRegistration = this.deviceRegistrationRepository.create({
      externalDeviceId: providerDevice.id,
      providerState: providerDevice.state ?? '',
      jid: providerDevice.jid ?? '',
      sessionJid: providerDevice.jid ?? '',
      providerCreatedAt: providerDevice.created_at
        ? new Date(providerDevice.created_at)
        : undefined,
      isActive: true,
      isLoggedIn: (providerDevice.state ?? '').toLowerCase() === 'logged_in',
    });

    return this.deviceRegistrationRepository.save(newRegistration);
  }
}
