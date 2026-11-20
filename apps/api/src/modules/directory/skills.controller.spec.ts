import { UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { SkillsController } from './skills.controller.js';

const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };
const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('SkillsController', () => {
  const skills = { listSkills: vi.fn() };
  const controller = new SkillsController(skills as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to PMs', () => {
    expect(Reflect.getMetadata('__guards__', SkillsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, SkillsController)).toEqual(['PM']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.list(pmReq);
    expect(skills.listSkills).toHaveBeenCalledWith(PM);
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => controller.list({})).toThrow(UnauthorizedException);
    expect(skills.listSkills).not.toHaveBeenCalled();
  });
});
