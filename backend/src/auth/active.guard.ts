import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_INACTIVE, IS_PUBLIC } from './public.decorator';
import { RequestUser } from './current-user.decorator';

@Injectable()
export class ActiveGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    if (!user) return isPublic;
    if (user.activo) return true;
    const allowInactive = this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowInactive) return true;
    throw new ForbiddenException('Tu cuenta está desactivada. Contacta a un administrador.');
  }
}
