import { Controller, Logger } from '@nestjs/common';
import { OrderService } from './order.service';

@Controller('order')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}
}
