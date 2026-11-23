import { Injectable } from '@nestjs/common';
import type { MailDeliveryDto, MailPurposeDto, MailStatusDto } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface SendMailPayload {
  workspaceId: string;
  purpose: MailPurposeDto;
  recipient: string;
  subject: string;
  body: string;
  reportId?: string;
  reportVersionId?: string;
  sprintTaskId?: string;
}

export interface MailProviderResult {
  status: MailStatusDto;
  error?: string;
}

export interface MailProvider {
  send(payload: SendMailPayload): Promise<MailProviderResult>;
}

/**
 * Phase 1 local stub mail provider (Team Execution Guide: E08 provides
 * MailService.send() early for E01, E06 and E08; real SMTP/API provider swaps
 * in behind this interface without touching callers).
 */
export class StubMailProvider implements MailProvider {
  async send(_payload: SendMailPayload): Promise<MailProviderResult> {
    return {
      status: 'QUEUED',
      error: 'Email provider is not connected in this environment.',
    };
  }
}

@Injectable()
export class MailService {
  private readonly provider: MailProvider;

  constructor(private readonly prisma: PrismaService) {
    this.provider = new StubMailProvider();
  }

  /**
   * Shared mail send API for E01 (auth/verification), E06 (task-owner approval),
   * and E08 (report email delivery). Records MailDelivery + MailAttempt.
   */
  async send(payload: SendMailPayload): Promise<MailDeliveryDto> {
    const result = await this.provider.send(payload);

    const delivery = await this.prisma.mailDelivery.create({
      data: {
        workspaceId: payload.workspaceId,
        purpose: payload.purpose,
        reportId: payload.reportId ?? null,
        reportVersionId: payload.reportVersionId ?? null,
        sprintTaskId: payload.sprintTaskId ?? null,
        recipient: payload.recipient,
        subject: payload.subject,
        status: result.status,
        attempts: 1,
        mailAttempts: {
          create: {
            workspaceId: payload.workspaceId,
            attemptNo: 1,
            status: result.status,
            error: result.error ?? null,
          },
        },
      },
      include: {
        mailAttempts: { orderBy: { attemptNo: 'asc' } },
      },
    });

    return this.toDto(delivery);
  }

  async retryDelivery(
    workspaceId: string,
    deliveryId: string,
    body = '',
  ): Promise<MailDeliveryDto | null> {
    const existing = await this.prisma.mailDelivery.findFirst({
      where: { id: deliveryId, workspaceId },
      include: { mailAttempts: { orderBy: { attemptNo: 'asc' } } },
    });
    if (!existing) return null;

    const nextAttemptNo = existing.attempts + 1;
    const result = await this.provider.send({
      workspaceId,
      purpose: existing.purpose,
      recipient: existing.recipient,
      subject: existing.subject,
      body,
      reportId: existing.reportId ?? undefined,
      reportVersionId: existing.reportVersionId ?? undefined,
      sprintTaskId: existing.sprintTaskId ?? undefined,
    });

    const updated = await this.prisma.mailDelivery.update({
      where: { id: existing.id },
      data: {
        status: result.status,
        attempts: nextAttemptNo,
        mailAttempts: {
          create: {
            workspaceId,
            attemptNo: nextAttemptNo,
            status: result.status,
            error: result.error ?? null,
          },
        },
      },
      include: {
        mailAttempts: { orderBy: { attemptNo: 'asc' } },
      },
    });

    return this.toDto(updated);
  }

  toDto(record: {
    id: string;
    purpose: string;
    reportId: string | null;
    reportVersionId: string | null;
    recipient: string;
    subject: string;
    status: string;
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
    mailAttempts: Array<{
      id: string;
      attemptNo: number;
      status: string;
      error: string | null;
      attemptedAt: Date;
    }>;
  }): MailDeliveryDto {
    return {
      id: record.id,
      purpose: record.purpose as MailPurposeDto,
      reportId: record.reportId,
      reportVersionId: record.reportVersionId,
      recipient: record.recipient,
      subject: record.subject,
      status: record.status as MailStatusDto,
      attempts: record.attempts,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      mailAttempts: record.mailAttempts.map((a) => ({
        id: a.id,
        attemptNo: a.attemptNo,
        status: a.status as MailStatusDto,
        error: a.error,
        attemptedAt: a.attemptedAt.toISOString(),
      })),
    };
  }
}
