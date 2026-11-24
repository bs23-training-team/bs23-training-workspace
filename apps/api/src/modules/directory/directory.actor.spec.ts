import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { forbiddenScope, requirePm, requireTrainee } from './directory.actor.js';

const pmReq = { user: { sub: 'PM001', sid: 's1', workspaceId: 'ws1', role: 'PM' } };
const traineeReq = { user: { sub: 'BS23001', sid: 's2', workspaceId: 'ws1', role: 'TRAINEE' } };

describe('requirePm', () => {
  it('returns the PM and workspace from req.user', () => {
    expect(requirePm(pmReq)).toEqual({ pmId: 'PM001', workspaceId: 'ws1' });
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => requirePm({})).toThrow(UnauthorizedException);
  });

  it('answers 401 when req.user has no id or workspace', () => {
    expect(() => requirePm({ user: { role: 'PM' } })).toThrow(UnauthorizedException);
    expect(() => requirePm({ user: { sub: 'PM001', role: 'PM' } })).toThrow(UnauthorizedException);
  });

  it('answers 403 for a trainee', () => {
    expect(() => requirePm(traineeReq)).toThrow(ForbiddenException);
  });
});

describe('forbiddenScope', () => {
  it('is a 403 with the FORBIDDEN_SCOPE code', () => {
    const error = forbiddenScope('user');
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({ code: 'FORBIDDEN_SCOPE', message: 'This user is not managed by you.' });
  });
});

describe('requireTrainee', () => {
  it('returns the user and workspace from req.user', () => {
    expect(requireTrainee(traineeReq)).toEqual({ userId: 'BS23001', workspaceId: 'ws1' });
  });

  it('answers 401 when there is no req.user', () => {
    expect(() => requireTrainee({})).toThrow(UnauthorizedException);
  });

  it('answers 403 for a PM', () => {
    expect(() => requireTrainee(pmReq)).toThrow(ForbiddenException);
  });
});
