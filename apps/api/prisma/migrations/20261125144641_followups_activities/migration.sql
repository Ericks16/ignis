-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateTable
CREATE TABLE "FollowUpStatus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "installationId" TEXT,
    "systemId" TEXT,
    "maintenanceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "typeId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIA',
    "responsibleId" TEXT,
    "startDate" DATE NOT NULL,
    "targetDate" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "nextAction" TEXT,
    "observations" TEXT,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTechnician" (
    "followUpId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,

    CONSTRAINT "FollowUpTechnician_pkey" PRIMARY KEY ("followUpId","technicianId")
);

-- CreateTable
CREATE TABLE "FollowUpHistory" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "fromName" TEXT,
    "toName" TEXT NOT NULL,
    "changedById" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "installationId" TEXT,
    "followUpId" TEXT,
    "maintenanceId" TEXT,
    "userId" TEXT,
    "typeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpStatus_name_key" ON "FollowUpStatus"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpType_name_key" ON "FollowUpType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityType_name_key" ON "ActivityType"("name");

-- CreateIndex
CREATE INDEX "FollowUp_clientId_idx" ON "FollowUp"("clientId");

-- CreateIndex
CREATE INDEX "FollowUp_statusId_targetDate_idx" ON "FollowUp"("statusId", "targetDate");

-- CreateIndex
CREATE INDEX "FollowUp_responsibleId_idx" ON "FollowUp"("responsibleId");

-- CreateIndex
CREATE INDEX "FollowUpTechnician_technicianId_idx" ON "FollowUpTechnician"("technicianId");

-- CreateIndex
CREATE INDEX "FollowUpHistory_followUpId_createdAt_idx" ON "FollowUpHistory"("followUpId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_clientId_occurredAt_idx" ON "Activity"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_followUpId_idx" ON "Activity"("followUpId");

-- CreateIndex
CREATE INDEX "Activity_maintenanceId_idx" ON "Activity"("maintenanceId");

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "InstalledSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "FollowUpType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "FollowUpStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTechnician" ADD CONSTRAINT "FollowUpTechnician_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTechnician" ADD CONSTRAINT "FollowUpTechnician_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpHistory" ADD CONSTRAINT "FollowUpHistory_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpHistory" ADD CONSTRAINT "FollowUpHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Estados de seguimiento iniciales (de sistema; FINALIZADO y CANCELADO son terminales)
INSERT INTO "FollowUpStatus" ("id","name","isTerminal","isSystem","sortOrder","updatedAt") VALUES
  (gen_random_uuid(),'PENDIENTE',false,true,1,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'EN PROCESO',false,true,2,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'ESPERANDO CLIENTE',false,true,3,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'ESPERANDO REPUESTOS',false,true,4,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'PROGRAMADO',false,true,5,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'FINALIZADO',true,true,6,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'CANCELADO',true,true,7,CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "FollowUpType" ("id","name","updatedAt") VALUES
  (gen_random_uuid(),'Cotización',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Actividad comercial',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Observación técnica',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Requerimiento del cliente',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Mantenimiento',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Otro',CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "ActivityType" ("id","name","updatedAt") VALUES
  (gen_random_uuid(),'Llamada al cliente',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Cotización enviada',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Cliente confirmó mantenimiento',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Visita reprogramada',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Técnico asignado',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Inspección realizada',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Recomendaciones enviadas',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Repuesto solicitado',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Seguimiento finalizado',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Otro',CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
