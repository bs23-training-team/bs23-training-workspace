import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { requirePm, requireTrainee } from './directory.actor.js';

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

  it('accepts every User resource role, not only TRAINEE', () => {
    for (const role of ['CENTRAL_LND', 'INDUSTRIAL_ATTACHMENT', 'SBU']) {
      const req = { user: { sub: 'BS23002', sid: 's3', workspaceId: 'ws1', role } };
      expect(requireTrainee(req)).toEqual({ userId: 'BS23002', workspaceId: 'ws1' });
    }
  });

  it('answers 403 for an unknown role', () => {
    expect(() => requireTrainee({ user: { sub: 'X1', workspaceId: 'ws1', role: 'ADMIN' } })).toThrow(ForbiddenException);
  });
});
