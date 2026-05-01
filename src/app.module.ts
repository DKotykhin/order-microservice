import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './utils/validators/env-validator';
import { EnvironmentVariables } from './utils/env.dto';
import { RedisModule } from './redis/redis.module';
import { MessageBrokerModule } from './message-broker/message-broker.module';
import { CartModule } from './cart/cart.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local'],
      validate: (config) => validateEnv(config, EnvironmentVariables),
    }),
    RedisModule,
    MessageBrokerModule,
    CartModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
