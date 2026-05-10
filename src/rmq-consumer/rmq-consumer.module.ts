import { Global, Module } from '@nestjs/common';

import { RmqConsumerService } from './rmq-consumer.service';

@Global()
@Module({
  providers: [RmqConsumerService],
  exports: [RmqConsumerService],
})
export class RmqConsumerModule {}
