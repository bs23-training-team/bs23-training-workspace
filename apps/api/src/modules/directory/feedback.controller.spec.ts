import { UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../identity/decorators/access.decorators.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { FeedbackController } from './feedback.controller.js';

const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };
const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('FeedbackController', () => {
  const feedback = { saveFeedback: vi.fn() };
  const controller = new FeedbackController(feedback as never);

  beforeEach(() => vi.clearAllMocks());

  it('is behind the login guard and limited to PMs', () => {
    expect(Reflect.getMetadata('__guards__', FeedbackController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, FeedbackController)).toEqual(['PM']);
  });

  it('takes the caller only from req.user', async () => {
    await controller.save('BS23001', pmReq, { text: 'Good.' });
    expect(feedback.saveFeedback).toHaveBeenCalledWith(PM, 'BS23001', 'Good.');
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => controller.save('BS23001', {}, { text: 'Good.' })).toThrow(UnauthorizedException);
    expect(feedback.saveFeedback).not.toHaveBeenCalled();
  });
});
