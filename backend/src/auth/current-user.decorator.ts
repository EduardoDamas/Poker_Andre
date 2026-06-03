import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest, JwtPayload } from './jwt-auth.guard';

/** Injects the authenticated user (JWT payload) into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    return ctx.switchToHttp().getRequest<AuthedRequest>().user;
  },
);
