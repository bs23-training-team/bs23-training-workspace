import { describe, expect, it } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { requirePmActor, requireUserActor } from './reports.actor.js';

describe('reports.actor', () => {
  describe('requirePmActor', () => {
    it('accepts valid PM req.user', () => {
      const actor = requirePmActor({
        user: { role: 'PM', pmId: 'PM001', workspaceId: 'ws-1' },
      });
      expect(actor).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'ws-1' });
    });

    it('throws UnauthorizedException when req.user is missing', () => {
      expect(() => requirePmActor({})).toThrow(UnauthorizedException);
      expect(() => requirePmActor({ user: undefined })).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when pmId or workspaceId is missing', () => {
      expect(() => requirePmActor({ user: { role: 'PM', pmId: 'PM001' } })).toThrow(
        UnauthorizedException,
      );
      expect(() => requirePmActor({ user: { role: 'PM', workspaceId: 'ws-1' } })).toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException when role is not PM', () => {
      expect(() =>
        requirePmActor({
          user: { role: 'USER', pmId: 'PM001', workspaceId: 'ws-1' },
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('requireUserActor', () => {
    it('accepts valid User req.user', () => {
      const actor = requireUserActor({
        user: { role: 'USER', userId: 'BS23001', workspaceId: 'ws-1' },
      });
      expect(actor).toEqual({ role: 'USER', userId: 'BS23001', workspaceId: 'ws-1' });
    });

    it('throws UnauthorizedException when req.user is missing', () => {
      expect(() => requireUserActor({})).toThrow(UnauthorizedException);
      expect(() => requireUserActor({ user: undefined })).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when userId or workspaceId is missing', () => {
      expect(() => requireUserActor({ user: { role: 'USER', userId: 'BS23001' } })).toThrow(
        UnauthorizedException,
      );
      expect(() => requireUserActor({ user: { role: 'USER', workspaceId: 'ws-1' } })).toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException when role is PM', () => {
      expect(() =>
        requireUserActor({
          user: { role: 'PM', userId: 'BS23001', workspaceId: 'ws-1' },
        }),
      ).toThrow(ForbiddenException);
    });
  });
});
