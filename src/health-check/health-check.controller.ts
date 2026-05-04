import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';

import {
  HEALTH_CHECK_SERVICE_NAME,
  type HealthCheckResponse,
  type ReadinessResponse,
} from 'src/generated-types/health-check';
import { HealthCheckService } from './health-check.service';

@Controller()
export class HealthCheckController {
  private readonly logger = new Logger(HealthCheckController.name);
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @GrpcMethod(HEALTH_CHECK_SERVICE_NAME, 'CheckAppHealth')
  checkHealth(): HealthCheckResponse {
    this.logger.log('Health check requested');
    return {
      serving: true,
      message: 'Order microservice is healthy',
    };
  }

  @GrpcMethod(HEALTH_CHECK_SERVICE_NAME, 'CheckAppConnections')
  async checkAppConnections(): Promise<ReadinessResponse> {
    this.logger.log('Check app connections requested');
    return this.healthCheckService.checkAppConnections();
  }
}
