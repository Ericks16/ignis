-- CreateEnum
CREATE TYPE "SystemRelation" AS ENUM ('INSTALADO', 'MTTO');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('OPERATIVO', 'CON_FALLAS', 'FUERA_DE_SERVICIO');

-- CreateTable
CREATE TABLE "SystemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalledSystem" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "installedAt" DATE,
    "location" TEXT,
    "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'OPERATIVO',
    "relation" "SystemRelation",
    "description" TEXT,
    "notes" TEXT,
    "lastMaintenanceDate" DATE,
    "nextMaintenanceDate" DATE,
    "responsibleId" TEXT,
    "extra" JSONB,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstalledSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "status" "OperationalStatus" NOT NULL DEFAULT 'OPERATIVO',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemCategory_name_key" ON "SystemCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentType_name_key" ON "EquipmentType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentType_code_key" ON "EquipmentType"("code");

-- CreateIndex
CREATE INDEX "InstalledSystem_installationId_idx" ON "InstalledSystem"("installationId");

-- CreateIndex
CREATE INDEX "InstalledSystem_categoryId_idx" ON "InstalledSystem"("categoryId");

-- CreateIndex
CREATE INDEX "InstalledSystem_nextMaintenanceDate_idx" ON "InstalledSystem"("nextMaintenanceDate");

-- CreateIndex
CREATE INDEX "InstalledSystem_status_idx" ON "InstalledSystem"("status");

-- CreateIndex
CREATE INDEX "Equipment_systemId_idx" ON "Equipment"("systemId");

-- CreateIndex
CREATE INDEX "Equipment_typeId_idx" ON "Equipment"("typeId");

-- AddForeignKey
ALTER TABLE "InstalledSystem" ADD CONSTRAINT "InstalledSystem_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSystem" ADD CONSTRAINT "InstalledSystem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SystemCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSystem" ADD CONSTRAINT "InstalledSystem_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "InstalledSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Catálogos iniciales (idempotente). Categorías oficiales de IGNIS y tipos de dispositivo del Excel.
INSERT INTO "SystemCategory" ("id","name","sortOrder","updatedAt") VALUES
  (gen_random_uuid(),'TIPO DE CENTRAL',1,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'BOMBA CI',2,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'GABINETES',3,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'LÁMPARAS',4,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'PARARRAYOS',5,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'SISTEMA DE DETECCIÓN DE ALARMA',6,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'RED CONTRA INCENDIOS',7,CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "EquipmentType" ("id","name","code","updatedAt") VALUES
  (gen_random_uuid(),'Detector de humo','DH',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Detector térmico','DT',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Estación manual','EM',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Luz estroboscópica','LUZ_ESTROB',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Expansor','EXPANSOR',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Parlante con luz','PARLANTE_LUZ',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Sensor de calor','SENSOR_CALOR',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Detector de gas','D_GAS',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Photobeam','PHOTOBEAM',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Módulo de monitoreo','M_MONITOREO',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Módulo relé','M_RELAY',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Módulo de aislamiento','M_AISLAMIENTO',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Panel de descarga','PANEL_DESCARGA',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Botón de aborto','BOTON_ABORTO',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Llave de mantenimiento','LLAVE_MTO',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Módulo de descarga','M_DESCARGA',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Solenoide','SOLENOIDE',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Activador manual','ACTIVADOR_MANUAL',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Cilindro','CILINDRO',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Tubería de descarga','TUBERIA_DESCARGA',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Boquilla de descarga','BOQUILLA_DESCARGA',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Lámpara de emergencia','LAMPARA',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Rociador','ROCIADOR',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Teclado','TECLADO',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Fuente de poder','FUENTE_PODER',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Sirena','SIRENA',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Batería','BATERIA',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'Panel / central','PANEL',CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
