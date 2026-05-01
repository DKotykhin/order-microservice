import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  public constructor(configService: ConfigService) {
    const options: RedisOptions = {
      host: configService.getOrThrow<string>('REDIS_HOST'),
      port: configService.getOrThrow<number>('REDIS_PORT'),
      db: configService.getOrThrow<number>('REDIS_DB'),
      maxRetriesPerRequest: 5,
      connectTimeout: 10000,
      enableOfflineQueue: true,
    };
    super(options);
  }

  async onModuleInit() {
    this.logger.log('Initializing RedisService...');
    this.on('connect', () => {
      this.logger.log('Connected to Redis server');
    });
    this.on('error', (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`, error.stack);
    });
    await this.ping();
    this.logger.log('RedisService initialized successfully');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down RedisService...');
    await this.quit();
    this.logger.log('RedisService shut down successfully');
  }
}
