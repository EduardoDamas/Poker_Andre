import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameGateway } from './game.gateway';

@Module({
  imports: [AuthModule], // provides JwtService (via exported JwtModule)
  providers: [GameGateway],
})
export class RealtimeModule {}
