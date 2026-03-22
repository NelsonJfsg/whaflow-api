import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export function getTypeOrmConfig(configService?: ConfigService): TypeOrmModuleOptions {
  const get = (key: string, fallback: string) =>
    configService?.get<string>(key) ?? process.env[key] ?? fallback;

  const synchronize = get('DB_SYNCHRONIZE', 'false') === 'true';

  return {
    type: 'mysql',
    host: get('DB_HOST', 'localhost'),
    port: Number(get('DB_PORT', '3306')),
    username: get('DB_USERNAME', 'root'),
    password: get('DB_PASSWORD', ''),
    database: get('DB_DATABASE', 'whaflow'),
    autoLoadEntities: true,
    synchronize,
  };
}
