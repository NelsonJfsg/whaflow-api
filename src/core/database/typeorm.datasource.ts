import 'dotenv/config';
import { DataSource } from 'typeorm';

const isTsRuntime = Boolean(process.env.TS_NODE) || Boolean(process.env.TS_NODE_PROJECT);

const entities = isTsRuntime
  ? ['src/**/*.entity.ts']
  : ['dist/**/*.entity.js'];

const migrations = isTsRuntime
  ? ['src/core/database/migrations/*.ts']
  : ['dist/core/database/migrations/*.js'];

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? '3306'),
  username: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'whaflow',
  entities,
  migrations,
  synchronize: false,
  logging: false,
});
