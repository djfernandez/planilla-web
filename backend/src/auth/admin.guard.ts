import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestUser } from './current-user.decorator';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
    if (user?.rol !== 'ADMIN') {
      throw new ForbiddenException('Solo un administrador puede hacer esto.');
    }
    return true;
  }
}
