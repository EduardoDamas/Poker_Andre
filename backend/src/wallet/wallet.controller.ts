import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WalletService } from './wallet.service';
import { DepositService } from './deposit.service';
import { WithdrawalService } from './withdrawal.service';
import { CreateDepositDto } from './dto/deposit.dto';
import { CreateWithdrawalDto } from './dto/withdrawal.dto';

interface DepositView {
  id: string;
  amountCents: string;
  status: string;
  requestedAt: Date;
}

// Player-facing wallet endpoints. Requires a logged-in player.
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly deposits: DepositService,
    private readonly withdrawals: WithdrawalService,
  ) {}

  @Get('balance')
  async balance(@CurrentUser() user: JwtPayload): Promise<{ balanceCents: string }> {
    return { balanceCents: (await this.wallet.getBalance(user.sub)).toString() };
  }

  // Player declares an incoming Pix; admin confirms it later.
  @Post('deposit')
  async requestDeposit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDepositDto,
  ): Promise<DepositView> {
    const dep = await this.deposits.request(user.sub, BigInt(dto.amountCents), dto.pixReference);
    return {
      id: dep.id,
      amountCents: dep.amountCents.toString(),
      status: dep.status,
      requestedAt: dep.requestedAt,
    };
  }

  // Player requests a Pix payout; funds are reserved immediately (see WithdrawalService).
  @Post('withdraw')
  async requestWithdrawal(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<{ id: string; amountCents: string; status: string }> {
    const wd = await this.withdrawals.request(user.sub, BigInt(dto.amountCents), dto.pixKey);
    return { id: wd.id, amountCents: wd.amountCents.toString(), status: wd.status };
  }

  @Get('deposits')
  async myDeposits(@CurrentUser() user: JwtPayload): Promise<DepositView[]> {
    const all = await this.deposits.list();
    return all
      .filter((d) => d.userId === user.sub)
      .map((d) => ({
        id: d.id,
        amountCents: d.amountCents.toString(),
        status: d.status,
        requestedAt: d.requestedAt,
      }));
  }
}
