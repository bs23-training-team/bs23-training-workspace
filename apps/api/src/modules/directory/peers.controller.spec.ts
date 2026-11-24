import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { PeersController } from './peers.controller.js';

const traineeReq = { user: { sub: 'BS23001', sid: 's2', workspaceId: 'ws1', role: 'TRAINEE' } };
const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };

describe('PeersController', () => {
  const peers = { listPeers: vi.fn() };
  const controller = new PeersController(peers as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to trainees', () => {
    expect(Reflect.getMetadata('__guards__', PeersController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, PeersController)).toEqual(['TRAINEE']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.list(traineeReq, 'BS23005', '20');
    expect(peers.listPeers).toHaveBeenCalledWith(
      { userId: 'BS23001', workspaceId: 'ws1' },
      { cursor: 'BS23005', limit: 20 },
    );
  });

  it('passes no cursor and no limit when they are not given', async () => {
    await controller.list(traineeReq);
    expect(peers.listPeers).toHaveBeenCalledWith(
      { userId: 'BS23001', workspaceId: 'ws1' },
      { cursor: undefined, limit: undefined },
    );
  });

  it('answers 401 without req.user and 403 for a PM', () => {
    expect(() => controller.list({})).toThrow(UnauthorizedException);
    expect(() => controller.list(pmReq)).toThrow(ForbiddenException);
    expect(peers.listPeers).not.toHaveBeenCalled();
  });

  it('answers 400, not 500, for a repeated, too long or non-numeric query value', () => {
    expect(() => controller.list(traineeReq, ['a', 'b'])).toThrow(BadRequestException);
    expect(() => controller.list(traineeReq, undefined, ['5', '6'])).toThrow(BadRequestException);
    expect(() => controller.list(traineeReq, 'x'.repeat(65))).toThrow(BadRequestException);
    expect(() => controller.list(traineeReq, undefined, 'ten')).toThrow(BadRequestException);
    expect(() => controller.list(traineeReq, undefined, '2.5')).toThrow(BadRequestException);
    expect(peers.listPeers).not.toHaveBeenCalled();
  });
});
