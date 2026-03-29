import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { AuthUser } from '../interfaces/auth-user.interface';

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new BadRequestException('Authenticated user id is required');
    }

    return String(userId);
  },
);
