import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { WithdrawalStatus, DepositStatus, Deposit } from '@prisma/client';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WithdrawalService } from '../wallet/withdrawal.service';
import { DepositService } from '../wallet/deposit.service';
import { AuditService } from '../audit/audit.service';
import { AdminGuard } from './admin.guard';
import { AdminService, AdminPlayer, AdminWithdrawal } from './admin.service';
import { SettleWithdrawalDto } from './dto/settle-withdrawal.dto';
import { SettleDepositDto } from '../wallet/dto/deposit.dto';
import { GrantSubscriptionDto } from './dto/grant-subscription.dto';
import { BlockUserDto } from './dto/block-user.dto';

function serializeDeposit(d: Deposit) {
  return {
    id: d.id,
    userId: d.userId,
    amountCents: d.amountCents.toString(),
    pixReference: d.pixReference,
    status: d.status,
    requestedAt: d.requestedAt,
    settledAt: d.settledAt,
    adminNote: d.adminNote,
  };
}

// Every route here requires a valid JWT (JwtAuthGuard) AND the ADMIN role (AdminGuard).
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly withdrawals: WithdrawalService,
    private readonly deposits: DepositService,
    private readonly audit: AuditService,
  ) {}

  @Get('players')
  players(): Promise<AdminPlayer[]> {
    return this.admin.listPlayers();
  }

  // Reject a pending application — frees the phone/CPF for re-registration.
  @Post('users/:id/reject')
  async rejectUser(@CurrentUser() admin: JwtPayload, @Param('id') id: string): Promise<{ ok: true }> {
    const freed = await this.admin.rejectApplication(id);
    await this.audit.record({
      actorId: admin.sub, action: 'user.reject', targetType: 'user', targetId: id, metadata: freed,
    });
    return { ok: true };
  }

  // Block a user (temporary if untilMs provided, else permanent).
  @Post('users/:id/block')
  async blockUser(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: BlockUserDto,
  ): Promise<{ ok: true }> {
    await this.admin.blockUser(id, dto.reason, dto.untilMs);
    await this.audit.record({
      actorId: admin.sub, action: 'user.block', targetType: 'user', targetId: id,
      metadata: { reason: dto.reason, untilMs: dto.untilMs ?? null },
    });
    return { ok: true };
  }

  // Unblock a user.
  @Post('users/:id/unblock')
  async unblockUser(@CurrentUser() admin: JwtPayload, @Param('id') id: string): Promise<{ ok: true }> {
    await this.admin.unblockUser(id);
    await this.audit.record({
      actorId: admin.sub, action: 'user.unblock', targetType: 'user', targetId: id,
    });
    return { ok: true };
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

  // --- Deposits (manual Pix) ---

  @Get('deposits')
  async listDeposits(@Query('status') status?: DepositStatus) {
    return (await this.deposits.list(status)).map(serializeDeposit);
  }

  // Admin confirms the Pix was received → wallet credited.
  @Post('deposits/:id/confirm')
  async confirmDeposit(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleDepositDto,
  ) {
    const dep = await this.deposits.confirm(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub, action: 'deposit.confirm', targetType: 'deposit', targetId: dep.id,
      metadata: { amountCents: dep.amountCents.toString(), note: dto.adminNote },
    });
    return serializeDeposit(dep);
  }

  @Post('deposits/:id/reject')
  async rejectDeposit(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SettleDepositDto,
  ) {
    const dep = await this.deposits.reject(id, dto.adminNote);
    await this.audit.record({
      actorId: admin.sub, action: 'deposit.reject', targetType: 'deposit', targetId: dep.id,
      metadata: { note: dto.adminNote },
    });
    return serializeDeposit(dep);
  }

  // --- Subscriptions (manual grant; purchase flow pending client pricing) ---

  // Grant/set a player's subscription tier (Phase 1: admin-assigned).
  @Post('users/:id/subscription')
  async grantSubscription(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: GrantSubscriptionDto,
  ): Promise<{ ok: true }> {
    await this.admin.setSubscription(id, dto.subscription, dto.untilMs);
    await this.audit.record({
      actorId: admin.sub, action: 'user.subscription', targetType: 'user', targetId: id,
      metadata: { subscription: dto.subscription, untilMs: dto.untilMs ?? null },
    });
    return { ok: true };
  }
}
