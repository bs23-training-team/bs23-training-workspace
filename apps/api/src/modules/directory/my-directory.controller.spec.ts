import { UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { MyDirectoryController } from './my-directory.controller.js';

const traineeReq = { user: { sub: 'BS23001', sid: 's2', workspaceId: 'ws1', role: 'USER' } };

describe('MyDirectoryController', () => {
  const mine = { getMine: vi.fn(), updateMine: vi.fn() };
  const controller = new MyDirectoryController(mine as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to trainees', () => {
    expect(Reflect.getMetadata('__guards__', MyDirectoryController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, MyDirectoryController)).toEqual(['USER']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.get(traineeReq);
    expect(mine.getMine).toHaveBeenCalledWith('BS23001');
    await controller.update(traineeReq, { name: 'Ann', bio: 'Hi' });
    expect(mine.updateMine).toHaveBeenCalledWith('BS23001', 'Ann', 'Hi');
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => controller.get({})).toThrow(UnauthorizedException);
    expect(() => controller.update({}, { name: 'Ann', bio: 'Hi' })).toThrow(UnauthorizedException);
    expect(mine.getMine).not.toHaveBeenCalled();
    expect(mine.updateMine).not.toHaveBeenCalled();
  });
});
