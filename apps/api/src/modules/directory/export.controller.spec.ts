import { UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { ExportController } from './export.controller.js';

const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };
const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('ExportController', () => {
  const exports = { exportUsers: vi.fn() };
  const controller = new ExportController(exports as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to PMs', () => {
    expect(Reflect.getMetadata('__guards__', ExportController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, ExportController)).toEqual(['PM']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.users(pmReq);
    expect(exports.exportUsers).toHaveBeenCalledWith(PM);
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => controller.users({})).toThrow(UnauthorizedException);
    expect(exports.exportUsers).not.toHaveBeenCalled();
  });
});
