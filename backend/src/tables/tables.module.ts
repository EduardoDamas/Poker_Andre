import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';

@Module({
  imports: [AuthModule, RealtimeModule], // JwtAuthGuard + live seat counts
  providers: [TablesService],
  controllers: [TablesController],
})
export class TablesModule {}
