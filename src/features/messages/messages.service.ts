import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageDispatchLog } from '../tasks/entities/message-dispatch-log.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(MessageDispatchLog)
    private readonly messageDispatchLogRepository: Repository<MessageDispatchLog>,
  ) {}

  async findAll(limit = 200) {
    const take = Number.isFinite(limit)
      ? Math.max(1, Math.min(1000, Math.trunc(limit)))
      : 200;

    const logs = await this.messageDispatchLogRepository.find({
      order: { id: 'DESC' },
      take,
    });

    return {
      code: 'SUCCESS',
      message: 'Success get sent messages',
      total: logs.length,
      results: logs,
    };
  }
}
