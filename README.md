# Planilla Web

Sistema interno para gestionar planillas de movilidad, aprobaciones y comprobantes de gastos del personal. La aplicación permite registrar viajes, validar la información por área, generar PDFs y administrar usuarios, empresas, partidas y configuraciones de la organización.

## Visión general

El proyecto está compuesto por:

- Frontend: Next.js 15 + React 19
- Backend: NestJS + Prisma
- Base de datos: PostgreSQL
- Almacenamiento de archivos: sistema de archivos local (`STORAGE_ROOT`)
- Ejecución local: Docker Compose

## Funcionalidades principales

- Registro de planillas de movilidad con detalle por línea
- Validación de aprobación por área (`V°B°`)
- Control de pagos y adjuntos de comprobantes
- Gestión de usuarios, áreas, empresas y partidas contables
- Generación de documentos PDF/Excel
- Consentimiento de rúbrica digital al ingresar
- Autenticación con JWT y refresh tokens
- Roles y permisos por perfil (`ADMIN` / `USUARIO`)

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js, React, TypeScript |
| Backend | NestJS, TypeScript, Passport, JWT |
| ORM | Prisma |
| Base de datos | PostgreSQL |
| Archivos | almacenamiento local vía `STORAGE_ROOT` |
| Contenedores | Docker / Docker Compose |

## Requisitos

- Docker Desktop o Docker Engine
- Docker Compose
- Node.js 20+ (solo si quieres correr la app sin contenedores)

## Inicio rápido con Docker

Desde la raíz del proyecto:

```bash
docker compose up --build
```

Esto levanta los servicios:

- PostgreSQL en `localhost:5433`
- Backend en `http://localhost:3001`
- Frontend en `http://localhost:3010`

El backend ejecuta automáticamente:

```bash
npx prisma migrate deploy
node prisma/seed.js
node dist/main.js
```

El seed crea un usuario administrador por defecto con:

- Email: `admin@padova.local`
- Password: `admin123`

## Variables de entorno

El archivo `docker-compose.yml` define las variables principales para la aplicación:

```env
DATABASE_URL=postgresql://planilla:planilla@postgres:5432/planilla
JWT_ACCESS_SECRET=cambia-este-secreto-access
JWT_REFRESH_SECRET=cambia-este-secreto-refresh
STORAGE_ROOT=/data/storage
ADMIN_EMAIL=admin@padova.local
ADMIN_PASSWORD=admin123
CORS_ORIGIN=http://localhost:3010
PORT=3001
COOKIE_SECURE=false
```

Para desarrollo local sin Docker, puedes crear un archivo `.env` en `backend/` con estos valores y ejecutarlo con:

```bash
cd backend
npm install
npm run prisma:generate
npm run start:dev
```

## Estructura del repositorio

```text
.
├── backend/                    # API REST en NestJS
│   ├── prisma/                 # esquema Prisma y seed
│   ├── src/                    # módulos y controladores
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── package.json
├── frontend/                   # aplicación Next.js
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
├── docker-compose.yml          # entorno local completo
└── README.md
```

## Modelo de datos (Prisma)

El esquema principal incluye estas entidades:

| Modelo | Descripción |
|--------|-------------|
| `User` | usuario del sistema, credenciales, perfil, rol, área y firma |
| `Empresa` | empresas asociadas a los trabajadores |
| `Area` | áreas organizacionales y aprobador responsable |
| `PartidaContable` | partidas contables disponibles |
| `MovilidadPartida` | partidas exclusivas para movilidad |
| `Counter` | contador por DNI para numeración de planillas |
| `Planilla` | cabecera de la planilla de movilidad |
| `PlanillaLinea` | cada viaje/registro dentro de la planilla |
| `Comprobante` | archivos adjuntos de soporte |
| `RefreshToken` | tokens de sesión para renovación de sesión |

## Roles y permisos

- `ADMIN`: acceso total a configuración y gestión del sistema.
- `USUARIO`: registra y consulta sus propias planillas.
- `Aprobador de área`: se configura en `Area.approverId` y puede evaluar la aprobación (`V°B°`) dentro del área correspondiente.

Las reglas de negocio se aplican en backend y en el guard de autenticación/estado activo del usuario.

## Desarrollo

### Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run start:dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend estará disponible en `http://localhost:3000` y se comunica con el backend mediante `API_URL`.

## Scripts útiles

### Backend

```bash
npm run build
npm run start
npm run prisma:migrate
npm run seed
```

### Frontend

```bash
npm run build
npm run start
```

## Seguridad

- Nunca subir secretos, credenciales ni archivos con información sensible al repositorio.
- La carpeta `STORAGE_ROOT` debe usarse para archivos del sistema y no exponerse públicamente.
- Cambia los valores por defecto de `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_PASSWORD` en entornos reales.
- En producción, no uses el usuario administrador por defecto ni secretos de ejemplo.

## Licencia

Uso interno de la organización. No redistribuir sin autorización.
