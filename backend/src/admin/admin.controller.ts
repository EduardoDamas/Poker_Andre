import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WithdrawalService } from '../wallet/withdrawal.service';
import { AdminGuard } from './admin.guard';
import { AdminService, AdminPlayer, AdminWithdrawal } from './admin.service';
import { SettleWithdrawalDto } from './dto/settle-withdrawal.dto';

// Every route here requires a valid JWT (JwtAuthGuard) AND the ADMIN role (AdminGuard).
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly withdrawals: WithdrawalService,
  ) {}

  @Get('players')
  players(): Promise<AdminPlayer[]> {
    return this.admin.listPlayers();
  }

  @Get('withdrawals')
  listWithdrawals(@Query('status') status?: WithdrawalStatus): Promise<AdminWithdrawal[]> {
    return this.admin.listWithdrawals(status);
  }

  // Admin confirms the manual Pix transfer was made — funds leave the system.
  @Post('withdrawals/:id/approve')
  async approve(@Param('id') id: string, @Body() dto: SettleWithdrawalDto): Promise<AdminWithdrawal> {
    return AdminService.serializeWithdrawal(await this.withdrawals.approve(id, dto.adminNote));
  }

  // Admin rejects the request — reserved funds return to the player.
  @Post('withdrawals/:id/reject')
  async reject(@Param('id') id: string, @Body() dto: SettleWithdrawalDto): Promise<AdminWithdrawal> {
    return AdminService.serializeWithdrawal(await this.withdrawals.reject(id, dto.adminNote));
  }
}
