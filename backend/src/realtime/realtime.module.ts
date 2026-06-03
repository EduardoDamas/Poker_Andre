import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameGateway } from './game.gateway';
import { TableService } from './table.service';

@Module({
  imports: [AuthModule], // provides JwtService (via exported JwtModule)
  providers: [GameGateway, TableService],
})
export class RealtimeModule {}
