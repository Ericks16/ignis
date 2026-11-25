-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('PROGRAMADO', 'PENDIENTE', 'EN_PROCESO', 'REALIZADO', 'CANCELADO', 'REPROGRAMADO');

-- CreateTable
CREATE TABLE "MaintenanceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technician" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT,
    "specialty" TEXT,
    "initials" TEXT,
    "hireDate" DATE,
    "notes" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Maintenance" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "executedDate" DATE,
    "nextMaintenanceDate" DATE,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'PROGRAMADO',
    "description" TEXT,
    "observations" TEXT,
    "recommendations" TEXT,
    "materials" TEXT,
    "result" TEXT,
    "rescheduledFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTechnician" (
    "maintenanceId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,

    CONSTRAINT "MaintenanceTechnician_pkey" PRIMARY KEY ("maintenanceId","technicianId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceType_name_key" ON "MaintenanceType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Technician_userId_key" ON "Technician"("userId");

-- CreateIndex
CREATE INDEX "Technician_status_idx" ON "Technician"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Maintenance_rescheduledFromId_key" ON "Maintenance"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "Maintenance_systemId_idx" ON "Maintenance"("systemId");

-- CreateIndex
CREATE INDEX "Maintenance_status_scheduledDate_idx" ON "Maintenance"("status", "scheduledDate");

-- CreateIndex
CREATE INDEX "Maintenance_scheduledDate_idx" ON "Maintenance"("scheduledDate");

-- CreateIndex
CREATE INDEX "MaintenanceTechnician_technicianId_idx" ON "MaintenanceTechnician"("technicianId");

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "InstalledSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MaintenanceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "Maintenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTechnician" ADD CONSTRAINT "MaintenanceTechnician_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTechnician" ADD CONSTRAINT "MaintenanceTechnician_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tipos de mantenimiento iniciales (catálogo configurable, idempotente)
INSERT INTO "MaintenanceType" ("id","name","updatedAt") VALUES
  (gen_random_uuid(),'Preventivo',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Correctivo',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Inspección',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Instalación',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Revisión técnica',CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
