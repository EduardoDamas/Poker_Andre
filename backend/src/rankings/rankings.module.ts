import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RankingsController } from './rankings.controller';

@Module({
  imports: [AuthModule], // JwtAuthGuard
  controllers: [RankingsController],
})
export class RankingsModule {}
