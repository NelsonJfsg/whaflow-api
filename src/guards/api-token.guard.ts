import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly logger = new Logger('ApiTokenGuard');

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    const expectedToken = this.configService.get<string>('API_TOKEN');
    this.logger.log(`[${request.method}] ${request.url}`);
    this.logger.log(`Authorization header: ${authHeader ? 'presente' : 'ausente'}`);

    if (!authHeader) {
      this.logger.warn('❌ Missing Authorization header');
      throw new UnauthorizedException('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      this.logger.warn('❌ Invalid Authorization format');
      throw new UnauthorizedException(
        'Invalid Authorization header format. Use: Bearer <token>',
      );
    }

    const token = parts[1];

    // Validar que API_TOKEN esté configurado
    if (!expectedToken) {
      this.logger.error('❌ API_TOKEN not configured in .env');
      throw new UnauthorizedException('Server error: API_TOKEN not configured');
    }

    // Validar que el token sea exacto
    if (token !== expectedToken) {
      this.logger.warn(`❌ Token inválido. Recibido: ${token.substring(0, 10)}...`);
      throw new UnauthorizedException('Invalid token');
    }

    this.logger.log('✅ Token válido - Request permitido');
    return true;
  }
}
