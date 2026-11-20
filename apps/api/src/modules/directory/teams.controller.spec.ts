import { UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { TeamsController } from './teams.controller.js';

const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };
const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('TeamsController', () => {
  const teams = { listTeams: vi.fn(), createTeam: vi.fn() };
  const controller = new TeamsController(teams as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to PMs', () => {
    expect(Reflect.getMetadata('__guards__', TeamsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, TeamsController)).toEqual(['PM']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.list(pmReq);
    expect(teams.listTeams).toHaveBeenCalledWith(PM);
    await controller.create(pmReq, { name: 'Delta' });
    expect(teams.createTeam).toHaveBeenCalledWith(PM, 'Delta');
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => controller.list({})).toThrow(UnauthorizedException);
    expect(() => controller.create({}, { name: 'Delta' })).toThrow(UnauthorizedException);
    expect(teams.listTeams).not.toHaveBeenCalled();
    expect(teams.createTeam).not.toHaveBeenCalled();
  });
});
