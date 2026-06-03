import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService, AdminPlayer, AdminWithdrawal } from './admin.service';

// Every route here requires a valid JWT (JwtAuthGuard) AND the ADMIN role (AdminGuard).
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('players')
  players(): Promise<AdminPlayer[]> {
    return this.admin.listPlayers();
  }

  @Get('withdrawals')
  withdrawals(@Query('status') status?: WithdrawalStatus): Promise<AdminWithdrawal[]> {
    return this.admin.listWithdrawals(status);
  }
}
