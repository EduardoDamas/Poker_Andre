import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TablesService, TableInfo } from './tables.service';

// Lobby — requires a logged-in player.
@Controller('tables')
@UseGuards(JwtAuthGuard)
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  list(): TableInfo[] {
    return this.tables.list();
  }
}
