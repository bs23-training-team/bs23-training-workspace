import { describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PASSWORD, makeHarness, seedAccounts } from '../../../test/support/identity-harness.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { requirePmActor, requireUserActor, type RequestWithActor } from './reports.actor.js';
import { MyReportsController, ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

describe('reports.actor', () => {
  describe('requirePmActor', () => {
    it('accepts valid E01 PM req.user ({ sub, sid, workspaceId, role: "PM" })', () => {
      const actor = requirePmActor({
        user: { sub: 'PM001', sid: 'sess-1', workspaceId: 'ws-1', role: 'PM' },
      });
      expect(actor).toEqual({ role: 'PM', pmId: 'PM001', workspaceId: 'ws-1' });
    });

    it('throws UnauthorizedException when req.user or required fields are missing', () => {
      expect(() => requirePmActor({})).toThrow(UnauthorizedException);
      expect(() => requirePmActor({ user: undefined })).toThrow(UnauthorizedException);
      expect(() => requirePmActor({ user: { role: 'PM', sub: 'PM001' } })).toThrow(
        UnauthorizedException,
      );
      expect(() => requirePmActor({ user: { role: 'PM', workspaceId: 'ws-1' } })).toThrow(
        UnauthorizedException,
      );
      expect(() => requirePmActor({ user: { sub: 'PM001', workspaceId: 'ws-1' } })).toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException when role is TRAINEE instead of PM', () => {
      expect(() =>
        requirePmActor({
          user: { sub: 'BS23001', sid: 'sess-2', workspaceId: 'ws-1', role: 'TRAINEE' },
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('requireUserActor', () => {
    it('accepts valid E01 TRAINEE req.user ({ sub, sid, workspaceId, role: "TRAINEE" })', () => {
      const actor = requireUserActor({
        user: { sub: 'BS23001', sid: 'sess-2', workspaceId: 'ws-1', role: 'TRAINEE' },
      });
      expect(actor).toEqual({ role: 'TRAINEE', userId: 'BS23001', workspaceId: 'ws-1' });
    });

    it('accepts every User resource role (CENTRAL_LND, INDUSTRIAL_ATTACHMENT, SBU)', () => {
      for (const role of ['CENTRAL_LND', 'INDUSTRIAL_ATTACHMENT', 'SBU'] as const) {
        const actor = requireUserActor({
          user: { sub: 'BS23002', sid: 'sess-3', workspaceId: 'ws-1', role },
        });
        expect(actor).toEqual({ role, userId: 'BS23002', workspaceId: 'ws-1' });
      }
    });

    it('throws ForbiddenException for a role that is not PM or a User resource', () => {
      expect(() =>
        requireUserActor({
          user: { sub: 'X1', sid: 's', workspaceId: 'ws-1', role: 'ADMIN' as never },
        }),
      ).toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException when req.user or required fields are missing', () => {
      expect(() => requireUserActor({})).toThrow(UnauthorizedException);
      expect(() => requireUserActor({ user: undefined })).toThrow(UnauthorizedException);
      expect(() => requireUserActor({ user: { role: 'TRAINEE', sub: 'BS23001' } })).toThrow(
        UnauthorizedException,
      );
      expect(() => requireUserActor({ user: { role: 'TRAINEE', workspaceId: 'ws-1' } })).toThrow(
        UnauthorizedException,
      );
      expect(() => requireUserActor({ user: { sub: 'BS23001', workspaceId: 'ws-1' } })).toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException when role is PM', () => {
      expect(() =>
        requireUserActor({
          user: { sub: 'PM001', sid: 'sess-1', workspaceId: 'ws-1', role: 'PM' },
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('ReportsController & MyReportsController guards (JwtAuthGuard + RolesGuard)', () => {
    it('returns 401 without a token, 403 when a PM token hits a trainee route, and succeeds for the right role', async () => {
      const h = await makeHarness();
      const seeded = await seedAccounts(h);
      const mockReportsService = {
        listMyPublishedReports: vi.fn().mockResolvedValue([]),
        getPmReport: vi.fn().mockResolvedValue({ report: null }),
      };

      const moduleRef = await Test.createTestingModule({
        controllers: [ReportsController, MyReportsController],
        providers: [
          { provide: ReportsService, useValue: mockReportsService },
          { provide: JwtService, useValue: h.jwt },
          { provide: ConfigService, useValue: h.config },
          { provide: PrismaService, useValue: h.db },
          Reflector,
          JwtAuthGuard,
          RolesGuard,
        ],
      }).compile();

      const myController = moduleRef.get(MyReportsController);

      // Run a request through the guards actually decorated on the controller class
      const invokeThroughGuards = async <T>(
        controllerClass: Type<unknown>,
        methodName: string,
        token?: string,
        runHandler?: (req: RequestWithActor) => Promise<T>,
      ): Promise<T> => {
        const guardTokens = (Reflect.getMetadata(GUARDS_METADATA, controllerClass) ?? []) as Array<
          Type<CanActivate>
        >;
        expect(guardTokens).toEqual([JwtAuthGuard, RolesGuard]);

        const req: RequestWithActor & { headers: Record<string, string | undefined> } = {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        };

        const proto = controllerClass.prototype as Record<string, (...args: never[]) => unknown>;
        const handler = proto[methodName];

        const context = {
          switchToHttp: () => ({ getRequest: () => req }),
          getHandler: () => handler,
          getClass: () => controllerClass,
        } as unknown as ExecutionContext;

        for (const guardToken of guardTokens) {
          const guard = moduleRef.get<CanActivate>(guardToken);
          await guard.canActivate(context);
        }

        return runHandler ? runHandler(req) : ({} as T);
      };

      // 1. Without a token -> 401 UnauthorizedException on both routes
      await expect(invokeThroughGuards(MyReportsController, 'listMyReports')).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(invokeThroughGuards(ReportsController, 'getReport')).rejects.toThrow(
        UnauthorizedException,
      );

      // 2. PM token on a trainee route -> 403 ForbiddenException
      const pmLogin = await h.service.login({
        identifier: seeded.pm.email,
        password: PASSWORD,
      });
      await expect(
        invokeThroughGuards(MyReportsController, 'listMyReports', pmLogin.accessToken),
      ).rejects.toThrow(ForbiddenException);

      // 3. Trainee token on a PM route -> 403 ForbiddenException
      const traineeLogin = await h.service.login({
        identifier: seeded.user.userId,
        password: PASSWORD,
      });
      await expect(
        invokeThroughGuards(ReportsController, 'getReport', traineeLogin.accessToken),
      ).rejects.toThrow(ForbiddenException);

      // 4. Trainee token on trainee route -> passes guards, populates req.user, and invokes controller
      await invokeThroughGuards(
        MyReportsController,
        'listMyReports',
        traineeLogin.accessToken,
        (req) => myController.listMyReports(req),
      );
      expect(mockReportsService.listMyPublishedReports).toHaveBeenCalledWith({
        role: 'TRAINEE',
        userId: seeded.user.userId,
        workspaceId: seeded.workspace.id,
      });
    });
  });
});
