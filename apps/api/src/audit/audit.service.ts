import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Nunca incluir contraseñas ni tokens en metadata. */
  async log(e: AuditEntry) {
    await this.prisma.auditLog.create({
      data: { actorId: e.actorId ?? null, action: e.action, entity: e.entity, entityId: e.entityId, metadata: e.metadata, ip: e.ip },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
