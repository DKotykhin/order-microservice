import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { validateEnv } from './utils/validators/env-validator';
import { EnvironmentVariables } from './utils/env.dto';
import { RedisModule } from './redis/redis.module';
import { MessageBrokerModule } from './message-broker/message-broker.module';
import { CartModule } from './cart/cart.module';
import { OrderModule } from './order/order.module';
import { DatabaseModule } from './database/database.module';
import { HealthCheckModule } from './health-check/health-check.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local'],
      validate: (config) => validateEnv(config, EnvironmentVariables),
    }),
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: configService.getOrThrow<number>('REDIS_PORT'),
          db: configService.getOrThrow<number>('REDIS_DB'),
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    RedisModule,
    MessageBrokerModule,
    HealthCheckModule,
    CartModule,
    OrderModule,
    WishlistModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
