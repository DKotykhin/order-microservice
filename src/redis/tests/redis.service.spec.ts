import { ConfigService } from '@nestjs/config';

const mockOn = jest.fn();
const mockPing = jest.fn().mockResolvedValue('PONG');
const mockQuit = jest.fn().mockResolvedValue('OK');

jest.mock('ioredis', () => {
  return {
    default: class MockRedis {
      on = mockOn;
      ping = mockPing;
      quit = mockQuit;
      constructor() {}
    },
    __esModule: true,
  };
});

import { RedisService } from '../redis.service';

describe('RedisService', () => {
  const configServiceMock = {
    getOrThrow: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configServiceMock.getOrThrow.mockImplementation((key: string) => {
      switch (key) {
        case 'REDIS_HOST':
          return 'localhost';
        case 'REDIS_PORT':
          return 6379;
      }
    });
  });

  it('should be defined', () => {
    const service = new RedisService(configServiceMock as unknown as ConfigService);

    expect(service).toBeDefined();
  });

  it('should call configService.getOrThrow with REDIS_HOST and REDIS_PORT', () => {
    new RedisService(configServiceMock as unknown as ConfigService);

    expect(configServiceMock.getOrThrow).toHaveBeenCalledWith('REDIS_HOST');
    expect(configServiceMock.getOrThrow).toHaveBeenCalledWith('REDIS_PORT');
  });

  it('should be an instance of RedisService', () => {
    const service = new RedisService(configServiceMock as unknown as ConfigService);

    expect(service).toBeInstanceOf(RedisService);
  });

  describe('onModuleInit', () => {
    it('should register connect and error event handlers', async () => {
      const service = new RedisService(configServiceMock as unknown as ConfigService);

      await service.onModuleInit();

      expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should call ping', async () => {
      const service = new RedisService(configServiceMock as unknown as ConfigService);

      await service.onModuleInit();

      expect(mockPing).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should call quit', async () => {
      const service = new RedisService(configServiceMock as unknown as ConfigService);

      await service.onModuleDestroy();

      expect(mockQuit).toHaveBeenCalled();
    });
  });
});
