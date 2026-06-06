import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;   // user id, or 'admin' for password-login admin sessions
  phone: string;
  role?: string; // 'ADMIN' for direct admin logins (not stored in DB)
}

// The authenticated user attached to the request by the guard.
export interface AuthedRequest extends Request {
  user: JwtPayload;
}

/**
 * Protects routes: requires a valid `Authorization: Bearer <jwt>` header.
 * On success, attaches the decoded payload to `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractBearer(req);
    if (!token) throw new UnauthorizedException('Missing bearer token.');

    try {
      req.user = await this.jwt.verifyAsync<JwtPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
