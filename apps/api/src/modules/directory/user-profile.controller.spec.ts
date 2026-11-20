import { UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { UserProfileController } from './user-profile.controller.js';

const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };
const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('UserProfileController', () => {
  const profiles = { getProfile: vi.fn() };
  const controller = new UserProfileController(profiles as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to PMs', () => {
    expect(Reflect.getMetadata('__guards__', UserProfileController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, UserProfileController)).toEqual(['PM']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.get('BS23001', pmReq);
    expect(profiles.getProfile).toHaveBeenCalledWith(PM, 'BS23001');
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => controller.get('BS23001', {})).toThrow(UnauthorizedException);
    expect(profiles.getProfile).not.toHaveBeenCalled();
  });
});
