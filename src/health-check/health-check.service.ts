import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { RedisService } from 'src/redis/redis.service';
import { MessageBrokerService } from 'src/message-broker/message-broker.service';
import type { DependencyHealth, ReadinessResponse } from 'src/generated-types/health-check';

@Injectable()
export class HealthCheckService {
  private static readonly HEALTH_CHECK_TIMEOUT_MS = 3000;
  private readonly logger = new Logger(HealthCheckService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly messageBrokerService: MessageBrokerService,
  ) {}

  async checkAppConnections(): Promise<ReadinessResponse> {
    const dependencies = await Promise.all([
      this.checkDependency('postgres', () => this.dataSource.query('SELECT 1')),
      this.checkDependency('redis', () => this.redis.ping()),
      this.checkDependency('rabbitmq', () => this.messageBrokerService.checkConnection()),
    ]);

    const allHealthy = dependencies.every((dep) => dep.healthy);

    return {
      serving: allHealthy,
      message: allHealthy ? 'All dependencies are healthy' : 'One or more dependencies are unhealthy',
      dependencies,
    };
  }

  private async checkDependency(name: string, check: () => Promise<unknown>): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await Promise.race([
        check(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${name} health check timed out`)),
            HealthCheckService.HEALTH_CHECK_TIMEOUT_MS,
          ),
        ),
      ]);
      return {
        name,
        healthy: true,
        message: `${name} is healthy`,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      this.logger.error(`${name} health check failed: ${error instanceof Error ? error.message : error}`);
      return {
        name,
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      };
    }
  }
}
