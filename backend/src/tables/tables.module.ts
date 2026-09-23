import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';
import { PromoModule } from '../promo/promo.module';

@Module({
  imports: [AuthModule, RealtimeModule, PromoModule], // JwtAuthGuard + live seat counts + promo rooms
  providers: [TablesService],
  controllers: [TablesController],
})
export class TablesModule {}
