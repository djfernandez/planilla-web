# Arquitectura C4

Modelo C4 de **Planilla Web**: el sistema interno para registrar planillas de movilidad, aprobarlas por área (V°B°), controlar pagos y adjuntar comprobantes.

- [Nivel 1: Contexto](#nivel-1-contexto)
- [Nivel 2: Contenedores](#nivel-2-contenedores)
- [Nivel 3: Componentes de la API](#nivel-3-componentes-de-la-api)
- [Despliegue](#despliegue-docker-compose)
- [Decisiones de arquitectura](#decisiones-de-arquitectura-relevantes)

---

## Nivel 1: Contexto

```mermaid
C4Context
  title Planilla Web - Diagrama de contexto

  Person(trabajador, "Trabajador", "Rol USUARIO. Registra sus planillas de movilidad y consulta su historial.")
  Person(aprobador, "Aprobador de área", "Usuario asignado en Area.approverId. Da o quita el V°B° a las planillas de su área.")
  Person(admin, "Administrador", "Rol ADMIN. Gestiona usuarios, catálogos, pagos y comprobantes.")

  System(planilla, "Planilla Web", "Registro, aprobación, pago y documentación de planillas de movilidad.")

  System_Ext(correo, "Cliente de correo", "Outlook, Thunderbird u otro. Abre el .eml generado para enviar la solicitud de reembolso.")
  System_Ext(excel, "Hoja de cálculo", "Excel o similar. Abre el historial exportado en .xlsx.")

  Rel(trabajador, planilla, "Registra planillas, firma consentimiento, exporta PDF+Correo", "HTTPS")
  Rel(aprobador, planilla, "Revisa y da V°B°", "HTTPS")
  Rel(admin, planilla, "Administra y marca pagos", "HTTPS")
  Rel(planilla, correo, "Genera .eml descargable", "Archivo")
  Rel(planilla, excel, "Genera .xlsx descargable", "Archivo")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

| Elemento | Descripción |
|----------|-------------|
| Trabajador | Cualquier usuario activo. Antes de emitir planillas debe registrar su rúbrica (consentimiento) |
| Aprobador de área | Ve las planillas de las áreas que tiene a cargo y puede dar V°B° |
| Administrador | Acceso total: usuarios, empresas, áreas, partidas, pagos, edición de líneas y comprobantes |
| Cliente de correo / hoja de cálculo | No hay integración directa. El sistema **no envía correos**: genera archivos que el usuario abre localmente |

---

## Nivel 2: Contenedores

```mermaid
C4Container
  title Planilla Web - Diagrama de contenedores

  Person(usuario, "Usuario", "Trabajador, aprobador o administrador")

  System_Boundary(pw, "Planilla Web") {
    Container(web, "Frontend Web", "Next.js 15, React 19, TypeScript", "UI (login, planilla, historial, ajustes, consentimiento). Genera PDF (jsPDF/pdf-lib), EML y XLSX en el navegador. Hace de proxy de /api/* hacia la API.")
    Container(api, "API REST", "NestJS, Passport JWT, Prisma", "Autenticación, autorización por rol/área, reglas de negocio (tope diario, numeración), gestión de archivos.")
    ContainerDb(db, "Base de datos", "PostgreSQL 16", "Usuarios, empresas, áreas, partidas, planillas, líneas, comprobantes, refresh tokens, contadores.")
    ContainerDb(fs, "Almacenamiento de archivos", "Volumen Docker (STORAGE_ROOT)", "PDFs de planillas, comprobantes, rúbricas, logos y PDFs de consentimiento.")
  }

  Rel(usuario, web, "Usa", "HTTPS :3010")
  Rel(web, api, "Reenvía /api/*", "HTTP/JSON + multipart, cookies httpOnly :3001")
  Rel(api, db, "Lee y escribe", "Prisma / SQL :5432")
  Rel(api, fs, "Guarda y sirve archivos", "fs")

  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

| Contenedor | Tecnología | Responsabilidades | Fuente |
|------------|-----------|-------------------|--------|
| Frontend Web | Next.js 15 / React 19 | Páginas en `app/`, sesión en `AuthProvider`, navegación y redirecciones en `Shell` (login → consentimiento → planilla), cliente HTTP con refresh automático, generación de documentos en el cliente | `frontend/` |
| API REST | NestJS | Endpoints bajo `/api`, guards globales, validación de DTOs, transacciones, streaming de archivos | `backend/src/` |
| Base de datos | PostgreSQL 16 | Persistencia relacional. *Advisory locks* para el tope diario | `backend/prisma/` |
| Almacenamiento | Filesystem / volumen `storage` | Archivos binarios, con rutas relativas guardadas en BD | `backend/src/storage/` |

> **Proxy:** el navegador solo habla con el frontend. `next.config.js` reescribe `/api/:path*` hacia `${API_URL}/api/:path*`, así las cookies httpOnly quedan en el mismo origen.

---

## Nivel 3: Componentes de la API

```mermaid
C4Component
  title API REST (NestJS) - Diagrama de componentes

  Container(web, "Frontend Web", "Next.js", "Proxy /api/*")
  ContainerDb(db, "PostgreSQL", "PostgreSQL 16")
  ContainerDb(fs, "Storage", "Volumen STORAGE_ROOT")

  Container_Boundary(api, "API REST") {
    Component(guards, "Guards globales", "JwtAuthGuard + ActiveGuard, AdminGuard por ruta", "Validan el JWT (cookie access_token o Bearer), cargan el usuario y bloquean cuentas inactivas y rutas solo-admin.")
    Component(auth, "AuthModule", "AuthController, AuthService, JwtStrategy", "login, refresh (rotación), logout, me. bcrypt + JWT 15 min + refresh 7 días.")
    Component(users, "UsersModule", "UsersController, UsersService", "CRUD de usuarios (admin), clave, consentimiento + rúbrica, descarga de firma y consentimiento.")
    Component(plan, "PlanillasModule", "PlanillasController, PlanillasService", "Siguiente número, acumulado diario, alta con tope S/ 45, listado con alcance por rol, V°B°, pago, edición de líneas, comprobantes.")
    Component(cat, "Catálogos", "EmpresasModule, AreasModule, PartidasModule, MovilidadesModule", "Empresas y logos, áreas y aprobador, partidas contables, partidas habilitadas para movilidad.")
    Component(health, "HealthController", "NestJS", "GET /api/health (público).")
    Component(prisma, "PrismaService", "Prisma Client", "Acceso a datos y transacciones.")
    Component(storage, "StorageService", "fs/promises", "save, remove y resolve con protección contra path traversal.")
  }

  Rel(web, guards, "HTTP /api/*")
  Rel(guards, auth, "Delega")
  Rel(guards, users, "Delega")
  Rel(guards, plan, "Delega")
  Rel(guards, cat, "Delega")
  Rel(auth, prisma, "Usuarios y refresh tokens")
  Rel(users, prisma, "Usa")
  Rel(plan, prisma, "Usa, con transacción + advisory lock")
  Rel(cat, prisma, "Usa")
  Rel(users, storage, "firmas/, consentimientos/")
  Rel(plan, storage, "planillas/, comprobantes/")
  Rel(cat, storage, "logos")
  Rel(prisma, db, "SQL")
  Rel(storage, fs, "Lee y escribe")

  UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="1")
```

### Endpoints por componente

Todos llevan el prefijo `/api`. "Admin" indica que exige `AdminGuard` o una validación de rol dentro del servicio.

| Componente | Endpoints |
|------------|-----------|
| AuthModule | `POST /auth/login` *(público)*, `POST /auth/refresh` *(público)*, `POST /auth/logout` *(público)*, `GET /auth/me` *(permite inactivos)* |
| UsersModule | `GET/POST /usuarios` (admin), `PATCH /usuarios/:id` (admin), `PATCH /usuarios/:id/clave` (admin), `POST /usuarios/:id/reset-consentimiento` (admin), `POST /usuarios/consentimiento`, `GET /usuarios/:id/firma`, `GET /usuarios/:id/consentimiento` |
| PlanillasModule | `GET /planillas/siguiente`, `GET /planillas/acumulado`, `GET /planillas`, `POST /planillas`, `GET /planillas/:id/pdf`, `PATCH /planillas/:id/vb` (aprobador/admin), `PATCH /planillas/:id/pago` (admin), `PATCH` y `DELETE /planillas/:id/lineas/:lineaId` (admin), `POST /planillas/:id/comprobantes` (admin), `GET /comprobantes/:id/archivo` |
| EmpresasModule | `GET /empresas`, `POST /empresas` (admin), `PATCH /empresas/:id` (admin), `POST /empresas/:id/logo` (admin), `GET /empresas/:id/logo` |
| AreasModule | `GET /areas`, `POST /areas`, `PATCH /areas/:id` y `DELETE /areas/:id` (admin) |
| PartidasModule | `GET/POST /partidas`, `POST /partidas/importar`, `PATCH` y `DELETE /partidas/:codigo` (todo admin) |
| MovilidadesModule | `GET /movilidades`, `PUT /movilidades` (admin) |
| HealthController | `GET /health` *(público)* |

### Reglas de autorización

- **Alcance de planillas** (`PlanillasService.alcance`): un `ADMIN` ve todas. Un aprobador ve las propias y las de sus áreas. Un usuario normal ve solo las suyas.
- **V°B°**: solo un `ADMIN` o el `approverId` del área de la planilla.
- **Pago, edición o borrado de líneas, comprobantes**: solo `ADMIN`. Los comprobantes además requieren que la planilla esté pagada.
- **Partidas**: un usuario no admin solo puede usar códigos de `MovilidadPartida`.
- **Usuario inactivo**: `ActiveGuard` responde 403, salvo en rutas marcadas con `@AllowInactive()`.

---

## Despliegue (Docker Compose)

```mermaid
C4Deployment
  title Despliegue local - docker compose (proyecto webplanilla)

  Deployment_Node(host, "Host Docker", "Docker Engine / Docker Desktop") {
    Deployment_Node(cweb, "planilla-web", "node, puerto 3010 a 3000") {
      Container(web, "Frontend Web", "Next.js", "API_URL=http://backend:3001")
    }
    Deployment_Node(capi, "planilla-api", "node, puerto 3001") {
      Container(api, "API REST", "NestJS", "Entrypoint: prisma migrate deploy, seed.js, node dist/main.js")
    }
    Deployment_Node(cdb, "planilla-db", "postgres:16-alpine, puerto 5433 a 5432") {
      ContainerDb(db, "PostgreSQL", "Volumen pgdata")
    }
    Deployment_Node(vol, "Volumen storage", "montado en /data/storage") {
      ContainerDb(fs, "Archivos", "STORAGE_ROOT")
    }
  }

  Rel(web, api, "HTTP", "red interna compose")
  Rel(api, db, "SQL", "DATABASE_URL")
  Rel(api, fs, "fs")
```

| Servicio | Imagen / build | Puerto host | Variables clave |
|----------|----------------|-------------|-----------------|
| `postgres` | `postgres:16-alpine` | 5433 | `POSTGRES_USER/PASSWORD/DB` |
| `backend` | `./backend` | 3001 | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `STORAGE_ROOT`, `CORS_ORIGIN`, `COOKIE_SECURE`, `ADMIN_EMAIL/PASSWORD` |
| `frontend` | `./frontend` | 3010 | `API_URL` |

---

## Decisiones de arquitectura relevantes

| Decisión | Motivo / consecuencia |
|----------|------------------------|
| **PDFs generados en el navegador** (jsPDF / pdf-lib) | El backend no necesita librerías de renderizado: solo recibe y guarda el PDF. Como contrapartida, el PDF lo arma el cliente, y el backend vuelve a validar los datos del `payload` por separado |
| **Cookies httpOnly + proxy de Next.js** | Los tokens no quedan accesibles a JavaScript y frontend y API comparten origen, así que no hay CORS en el navegador |
| **Refresh token opaco con hash SHA-256 y rotación** | Si se filtra la BD, los tokens no se pueden usar. Cada refresh invalida el token anterior |
| **`pg_advisory_xact_lock(hash(dni))`** | Serializa altas y ediciones del mismo trabajador, para que el tope diario de S/ 45 no se supere con solicitudes concurrentes |
| **Archivos en filesystem** (`STORAGE_ROOT`) | Despliegue simple. Escalar a varias réplicas exige un volumen compartido u object storage |
| **Compensación al guardar el PDF** | Si `StorageService.save` falla después del commit, se borra la planilla para no dejar registros huérfanos |
| **Datos desnormalizados en `Planilla`** (`userNombre`, `areaNombre`) | La planilla conserva los datos vigentes al emitirla, aunque después cambien el usuario o el área |
