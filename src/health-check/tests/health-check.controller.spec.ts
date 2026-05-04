import { Test, TestingModule } from '@nestjs/testing';

import { GrpcMetricsInterceptor } from 'src/supervision/metrics/interceptors';
import type { ReadinessResponse } from 'src/generated-types/health-check';
import { HealthCheckController } from '../health-check.controller';
import { HealthCheckService } from '../health-check.service';

describe('HealthCheckController', () => {
  let controller: HealthCheckController;

  const healthCheckServiceMock = {
    checkAppConnections: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthCheckController],
      providers: [{ provide: HealthCheckService, useValue: healthCheckServiceMock }],
    })
      .overrideInterceptor(GrpcMetricsInterceptor)
      .useValue({})
      .compile();

    controller = module.get<HealthCheckController>(HealthCheckController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkHealth', () => {
    it('should return serving true with health message', () => {
      const result = controller.checkHealth();

      expect(result).toEqual({
        serving: true,
        message: 'User microservice is healthy',
      });
    });
  });

  describe('checkAppConnections', () => {
    const mockReadinessResponse: ReadinessResponse = {
      serving: true,
      message: 'All dependencies are healthy',
      dependencies: [
        { name: 'postgres', healthy: true, message: 'postgres is healthy', latencyMs: 5 },
        { name: 'redis', healthy: true, message: 'redis is healthy', latencyMs: 2 },
        { name: 'rabbitmq', healthy: true, message: 'rabbitmq is healthy', latencyMs: 3 },
      ],
    };

    it('should call healthCheckService.checkAppConnections and return result', async () => {
      healthCheckServiceMock.checkAppConnections.mockResolvedValue(mockReadinessResponse);

      const result = await controller.checkAppConnections();

      expect(healthCheckServiceMock.checkAppConnections).toHaveBeenCalled();
      expect(result).toEqual(mockReadinessResponse);
    });

    it('should propagate errors from healthCheckService.checkAppConnections', async () => {
      const error = new Error('Check connections failed');
      healthCheckServiceMock.checkAppConnections.mockRejectedValue(error);

      await expect(controller.checkAppConnections()).rejects.toThrow(error);
    });
  });
});
