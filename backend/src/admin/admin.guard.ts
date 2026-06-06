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
    const payload = req.user;
    if (!payload?.sub) throw new ForbiddenException('Not authenticated.');

    // Admin password-login: role is embedded directly in the JWT.
    if (payload.role === 'ADMIN') return true;

    // Regular user login: look up the role in the database.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
    return true;
  }
}
