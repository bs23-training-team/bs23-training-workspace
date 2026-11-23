import { Injectable } from '@nestjs/common';
import type { NotificationPort } from '../ports/notification.port.js';

/**
 * TEMPORARY stand-in until E01's notifications module ships a real service.
 * It sends nothing, so users do NOT receive "XP decisions" notices yet.
 * When E01 is ready, replace the provider in growth-core.module.ts with an adapter to
 * their service. Tests use FakeNotificationPort, which records what would be sent.
 */
@Injectable()
export class NoopNotificationPort implements NotificationPort {
  async notifyUser(): Promise<void> {}
  async notifyPm(): Promise<void> {}
}
