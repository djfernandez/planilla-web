-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'USUARIO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'USUARIO',
    "empresaId" TEXT,
    "areaId" TEXT,
    "proyDef" TEXT NOT NULL DEFAULT '',
    "proyectos" TEXT[],
    "emailTo" TEXT[],
    "emailCc" TEXT[],
    "bank" TEXT NOT NULL DEFAULT 'BCP',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'SOLES',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "signaturePath" TEXT,
    "consentPdfPath" TEXT,
    "consentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razon" TEXT NOT NULL,
    "ruc" TEXT NOT NULL DEFAULT '',
    "direccion" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "approverId" TEXT,
    "allowedPrefixes" TEXT[],
    "allowedIds" TEXT[],

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partidas_contables" (
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "partidas_contables_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "movilidad_partidas" (
    "codigo" TEXT NOT NULL,

    CONSTRAINT "movilidad_partidas_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "counters" (
    "dni" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("dni")
);

-- CreateTable
CREATE TABLE "planillas" (
    "id" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fechaEmision" DATE NOT NULL,
    "fechaRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "userDni" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "areaId" TEXT NOT NULL DEFAULT '',
    "areaNombre" TEXT NOT NULL DEFAULT '',
    "vbOk" BOOLEAN NOT NULL DEFAULT false,
    "vbById" TEXT,
    "vbByName" TEXT,
    "vbAt" TIMESTAMP(3),
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "pagadoById" TEXT,
    "pagadoByName" TEXT,
    "pagadoAt" TIMESTAMP(3),
    "pdfPath" TEXT NOT NULL,

    CONSTRAINT "planillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planilla_lineas" (
    "id" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "destino" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "proyecto" TEXT NOT NULL,
    "pc" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "planilla_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_dni_key" ON "users"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "planillas_userId_idx" ON "planillas"("userId");

-- CreateIndex
CREATE INDEX "planillas_areaId_idx" ON "planillas"("areaId");

-- CreateIndex
CREATE INDEX "planillas_fechaEmision_idx" ON "planillas"("fechaEmision");

-- CreateIndex
CREATE UNIQUE INDEX "planillas_userDni_serie_numero_key" ON "planillas"("userDni", "serie", "numero");

-- CreateIndex
CREATE INDEX "planilla_lineas_planillaId_idx" ON "planilla_lineas"("planillaId");

-- CreateIndex
CREATE INDEX "comprobantes_planillaId_idx" ON "comprobantes"("planillaId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planillas" ADD CONSTRAINT "planillas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planilla_lineas" ADD CONSTRAINT "planilla_lineas_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "planillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "planillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

