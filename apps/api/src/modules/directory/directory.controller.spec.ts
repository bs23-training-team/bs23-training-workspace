import { UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { DirectoryController } from './directory.controller.js';

const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };
const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('DirectoryController', () => {
  const directory = { listUsers: vi.fn() };
  const controller = new DirectoryController(directory as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to PMs', () => {
    expect(Reflect.getMetadata('__guards__', DirectoryController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, DirectoryController)).toEqual(['PM']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.listUsers(pmReq, 'bris', undefined, undefined, undefined, '2', '10');
    expect(directory.listUsers).toHaveBeenCalledWith(PM, expect.objectContaining({ q: 'bris', page: 2, pageSize: 10 }));
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => controller.listUsers({})).toThrow(UnauthorizedException);
    expect(directory.listUsers).not.toHaveBeenCalled();
  });
});
