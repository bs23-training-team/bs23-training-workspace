import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { PeerListResponse } from '@bs23/contracts';
import { PeersService } from './peers.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requireTrainee, type RequestWithUser } from './directory.actor.js';

const MAX_CURSOR_LENGTH = 64;

/** HTTP only: read the request, call the service. The rules are in PeersService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
@Controller('directory/peers')
export class PeersController {
  constructor(private readonly peers: PeersService) {}

  @Get()
  list(
    @Req() req: RequestWithUser,
    @Query('cursor') cursor?: unknown,
    @Query('limit') limit?: unknown,
  ): Promise<PeerListResponse> {
    const actor = requireTrainee(req);
    return this.peers.listPeers(actor, { cursor: cursorOf(cursor), limit: toInt(limit, 'limit') });
  }
}

/** A query value must be one plain string. `?cursor=a&cursor=b` arrives as an array: answer 400, never a 500. */
function once(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${name} must be given once, as text.`);
  return value;
}

function cursorOf(value: unknown): string | undefined {
  const text = once(value, 'cursor');
  if (!text) return undefined;
  if (text.length > MAX_CURSOR_LENGTH) throw new BadRequestException('cursor is not valid.');
  return text;
}

function toInt(value: unknown, name: string): number | undefined {
  const text = once(value, name);
  if (text === undefined || text === '') return undefined;
  const n = Number(text);
  if (!Number.isInteger(n)) throw new BadRequestException(`${name} must be a whole number.`);
  return n;
}
