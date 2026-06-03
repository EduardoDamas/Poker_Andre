import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedRequest } from '../auth/jwt-auth.guard';

/**
 * Allows only ADMIN users. Runs AFTER JwtAuthGuard (which sets `req.user`).
 * The role is read from the database, not the token, so a demotion takes effect
 * immediately and an attacker cannot forge a role claim.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const userId = req.user?.sub;
    if (!userId) throw new ForbiddenException('Not authenticated.');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
    return true;
  }
}
