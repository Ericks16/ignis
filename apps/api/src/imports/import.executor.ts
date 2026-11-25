import { Prisma } from '@prisma/client';
import { parseDateOnly } from '../common/dates';
import { ImportConfig } from './import.mapping';
import { Plan } from './import.planner';

export interface ImportResult {
  clientsCreated: number; clientsReused: number; contactsCreated: number; installationsCreated: number; installationsReused: number;
  systemsCreated: number; systemsReused: number; equipmentCreated: number; historyCreated: number; historySkipped: number;
  scheduledCreated: number; scheduledSkipped: number; followUpsCreated: number; followUpsSkipped: number; rowsImported: number; rowsSkipped: number; rowsWithErrors: number;
}

const NOTE_HISTORY = 'Importado del Excel. La fecha corresponde al registro del Excel (puede ser aproximada: el Excel suele guardar solo mes y año).';

/**
 * Aplica el plan dentro de la transacción recibida. SOLO crea registros (y reutiliza los existentes):
 * nunca borra ni modifica datos que ya existían. Cada registro creado queda marcado con el lote de importación.
 */
export async function executePlan(tx: Prisma.TransactionClient, plan: Plan, cfg: ImportConfig, batchId: string, today: string): Promise<ImportResult> {
  const res: ImportResult = {
    clientsCreated: 0, clientsReused: 0, contactsCreated: 0, installationsCreated: 0, installationsReused: 0, systemsCreated: 0, systemsReused: 0, equipmentCreated: 0,
    historyCreated: 0, historySkipped: 0, scheduledCreated: 0, scheduledSkipped: 0, followUpsCreated: 0, followUpsSkipped: 0, rowsImported: 0,
    rowsSkipped: plan.rows.filter((r) => r.status === 'SKIPPED').length, rowsWithErrors: plan.rows.filter((r) => r.status === 'ERROR').length,
  };
  const pendingStatus = await tx.followUpStatus.findFirst({ where: { name: 'PENDIENTE', isSystem: true } });
  const clients = new Map<string, string>(); // clientKey -> id
  const installations = new Map<string, string>(); // clientKey|instKey -> id
  const systems = new Map<string, string>(); // sys.key -> id

  for (const row of plan.rows) {
    if (row.status === 'SKIPPED' || row.status === 'ERROR') continue;

    // Cliente (reutiliza el existente o el creado antes en este lote)
    let clientId = row.clientExistingId ?? clients.get(row.clientKey);
    if (!clientId) {
      const c = await tx.client.create({
        data: {
          commercialName: row.clientName, normalizedName: row.clientKey, ruc: row.ruc ?? null, email: row.clientEmail ?? null, city: row.city ?? null,
          status: row.lost ? 'INACTIVE' : 'ACTIVE', notes: row.lost ? 'Importado del Excel como «cliente perdido».' : null, importBatchId: batchId,
        },
      });
      clientId = c.id;
      res.clientsCreated++;
    } else res.clientsReused++;
    clients.set(row.clientKey, clientId);

    // Contacto
    if (row.contact?.isNew) {
      const exists = await tx.clientContact.findFirst({ where: { clientId, name: { equals: row.contact.name, mode: 'insensitive' } } });
      if (!exists) {
        await tx.clientContact.create({ data: { clientId, name: row.contact.name, email: row.contact.email ?? null, receivesNotifications: false } });
        res.contactsCreated++;
      }
    }

    // Instalación
    const ik = `${row.clientKey}|${row.installationKey}`;
    let installationId = row.installationExistingId ?? installations.get(ik);
    if (!installationId) {
      const i = await tx.installation.create({
        data: { clientId, name: row.installationName, status: row.lost ? 'INACTIVE' : 'ACTIVE', notes: 'Creada por importación del Excel.', importBatchId: batchId },
      });
      installationId = i.id;
      res.installationsCreated++;
    } else res.installationsReused++;
    installations.set(ik, installationId);

    // Sistema
    let systemId: string | undefined;
    if (row.system) {
      systemId = row.system.existingId ?? systems.get(row.system.key);
      if (!systemId && row.system.isNew) {
        const s = await tx.installedSystem.create({
          data: {
            installationId, categoryId: row.system.categoryId, brand: row.system.brand, model: row.system.model, relation: row.system.relation,
            lastMaintenanceDate: row.lastDate ? parseDateOnly(row.lastDate) : null,
            // Un próximo mantenimiento ya vencido se conserva solo como dato (modo HISTORICAL); IGNORE y los clientes perdidos no lo guardan.
            nextMaintenanceDate: row.nextDate && row.nextMode !== 'IGNORE' ? parseDateOnly(row.nextDate) : null,
            status: row.lost ? 'INACTIVE' : 'ACTIVE', notes: `Importado del Excel (fila ${row.rowNumber}).`, importBatchId: batchId,
          },
        });
        systemId = s.id;
        res.systemsCreated++;
        if (row.equipment.length) {
          await tx.equipment.createMany({ data: row.equipment.map((e) => ({ systemId: s.id, typeId: e.typeId, quantity: e.quantity })) });
          res.equipmentCreated += row.equipment.length;
        }
      } else if (systemId) res.systemsReused++;
      if (systemId) systems.set(row.system.key, systemId);
    }

    // Mantenimientos (sin duplicar los que ya existan)
    if (systemId && row.lastDate && cfg.options.importHistory) {
      const d = parseDateOnly(row.lastDate);
      const dup = await tx.maintenance.findFirst({ where: { systemId, status: 'REALIZADO', executedDate: d } });
      if (dup) res.historySkipped++;
      else {
        await tx.maintenance.create({
          data: { systemId, typeId: cfg.options.defaultMaintenanceTypeId, scheduledDate: d, executedDate: d, status: 'REALIZADO', observations: NOTE_HISTORY, importBatchId: batchId },
        });
        res.historyCreated++;
      }
    }
    if (systemId && row.nextDate && row.nextMode === 'SCHEDULE') {
      const d = parseDateOnly(row.nextDate);
      const dup = await tx.maintenance.findFirst({ where: { systemId, scheduledDate: d, status: { in: ['PROGRAMADO', 'PENDIENTE', 'EN_PROCESO'] } } });
      if (dup) res.scheduledSkipped++;
      else {
        await tx.maintenance.create({
          data: { systemId, typeId: cfg.options.defaultMaintenanceTypeId, scheduledDate: d, status: 'PROGRAMADO', description: 'Programado según el Excel.', importBatchId: batchId },
        });
        res.scheduledCreated++;
      }
    }

    // Seguimiento
    if (row.followUp && !row.followUp.skipExisting && pendingStatus) {
      const dup = await tx.followUp.findFirst({ where: { clientId, title: { equals: row.followUp.title, mode: 'insensitive' } } });
      if (dup) res.followUpsSkipped++;
      else {
        await tx.followUp.create({
          data: {
            clientId, installationId, systemId: systemId ?? null, title: row.followUp.title, description: row.followUp.description ?? null, typeId: cfg.options.followUpTypeId,
            statusId: pendingStatus.id, startDate: parseDateOnly(today), observations: `Importado del Excel (fila ${row.rowNumber}).`, importBatchId: batchId,
            history: { create: { toName: pendingStatus.name, comment: 'Seguimiento importado del Excel' } },
          },
        });
        res.followUpsCreated++;
      }
    }
    res.rowsImported++;
  }
  return res;
}

