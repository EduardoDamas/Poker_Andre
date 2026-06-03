import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WithdrawalService } from '../wallet/withdrawal.service';
import { AuditService } from '../audit/audit.service';
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
    private readonly audit: AuditService,
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
  async approve(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleWithdrawalDto,
  ): Promise<AdminWithdrawal> {
    const wd = await this.withdrawals.approve(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub,
      action: 'withdrawal.approve',
      targetType: 'withdrawal',
      targetId: wd.id,
      metadata: { amountCents: wd.amountCents.toString(), note: dto.adminNote },
    });
    return AdminService.serializeWithdrawal(wd);
  }

  // Admin rejects the request — reserved funds return to the player.
  @Post('withdrawals/:id/reject')
  async reject(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleWithdrawalDto,
  ): Promise<AdminWithdrawal> {
    const wd = await this.withdrawals.reject(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub,
      action: 'withdrawal.reject',
      targetType: 'withdrawal',
      targetId: wd.id,
      metadata: { amountCents: wd.amountCents.toString(), note: dto.adminNote },
    });
    return AdminService.serializeWithdrawal(wd);
  }
}
