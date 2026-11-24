import { UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { UserEditController } from './user-edit.controller.js';

const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };
const PM = { pmId: 'PM001', workspaceId: 'ws1' };
const body = {
  name: 'Ann',
  email: 'ann@bs23.test',
  position: 'FRONTEND',
  resource: 'TRAINEE',
  attendanceMode: 'PHYSICAL',
  onboardDate: '2026-05-01',
  departureDate: null,
  teamIds: [],
};

describe('UserEditController', () => {
  const edit = { updateUser: vi.fn() };
  const controller = new UserEditController(edit as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to PMs', () => {
    expect(Reflect.getMetadata('__guards__', UserEditController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, UserEditController)).toEqual(['PM']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.update('BS23001', pmReq, body);
    expect(edit.updateUser).toHaveBeenCalledWith(PM, 'BS23001', expect.objectContaining({ name: 'Ann' }));
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => controller.update('BS23001', {}, body)).toThrow(UnauthorizedException);
    expect(edit.updateUser).not.toHaveBeenCalled();
  });
});
