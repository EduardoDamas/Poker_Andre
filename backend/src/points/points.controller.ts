import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, Min } from 'class-validator';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PointsService } from './points.service';

class ConvertDto {
  @IsIn(['PAID_TO_FREE', 'FREE_TO_PAID'])
  direction!: 'PAID_TO_FREE' | 'FREE_TO_PAID';

  @IsInt()
  @Min(1)
  amount!: number;
}

/** Points economy — balances, conversion, the daily wheel, solo rewards. */
@Controller('points')
@UseGuards(JwtAuthGuard)
export class PointsController {
  constructor(private readonly points: PointsService) {}

  /** Balances, streak, today's spin, wheel layout, milestones, history. */
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.points.status(user.sub);
  }

  /** Convert paid ⇄ free at 1:1000. */
  @Post('convert')
  convert(@CurrentUser() user: JwtPayload, @Body() dto: ConvertDto) {
    return this.points.convert(user.sub, dto.direction, dto.amount);
  }

  /** Daily wheel spin (once per day; also the streak check-in). */
  @Post('wheel/spin')
  spin(@CurrentUser() user: JwtPayload) {
    return this.points.spin(user.sub);
  }

  /** Solo (vs bots) win reward — small award, hard daily cap. */
  @Post('game-reward')
  soloWin(@CurrentUser() user: JwtPayload) {
    return this.points.soloWin(user.sub);
  }
}
