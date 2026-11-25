# Planilla Web

Sistema interno para gestionar planillas de movilidad, aprobaciones y comprobantes de gastos del personal. La aplicación permite registrar viajes, validar la información por área, generar PDFs y administrar usuarios, empresas, partidas y configuraciones de la organización.

Este repositorio actúa como **paraguas** para orquestar el desarrollo local mediante Docker Compose. El código fuente, la documentación y la infraestructura están organizados en repositorios dedicados:

| Repositorio | Descripción | Tecnologías |
|---|---|---|
| **[planilla-backend](https://github.com/djfernandez/planilla-backend)** | API REST y lógica de negocio | NestJS, Prisma, PostgreSQL |
| **[planilla-frontend](https://github.com/djfernandez/planilla-frontend)** | Interfaz web de usuario | Next.js 15, React 19, TypeScript |
| **[planilla-docs](https://github.com/djfernandez/planilla-docs)** | Arquitectura C4, secuencias y modelo de datos | Markdown, Mermaid |
| **[planilla-terraform](https://github.com/djfernandez/planilla-terraform)** | Infraestructura en la nube | Azure (Container Apps, PostgreSQL, Key Vault) |

---

## Estructura de carpetas recomendada

Para trabajar con Docker Compose, clona todos los repositorios en la misma carpeta contenedora:

```text
Notas/
├── planilla-web/          # este repo (orquestador Docker Compose)
├── planilla-backend/      # API NestJS
├── planilla-frontend/     # Web Next.js
├── planilla-docs/         # Documentación de arquitectura
└── planilla-terraform/    # Infraestructura Azure
```

### Script de clonado rápido

```bash
git clone https://github.com/djfernandez/planilla-web.git
git clone https://github.com/djfernandez/planilla-backend.git
git clone https://github.com/djfernandez/planilla-frontend.git
git clone https://github.com/djfernandez/planilla-docs.git
git clone https://github.com/djfernandez/planilla-terraform.git
```

---

## Inicio rápido con Docker Compose

Desde la carpeta `planilla-web/`:

```bash
docker compose up --build
```

Esto levanta los servicios locales:

- **PostgreSQL**: `localhost:5433`
- **Backend API**: `http://localhost:3001` (health check: `/api/health`)
- **Frontend Web**: `http://localhost:3010`

El backend ejecuta automáticamente las migraciones y el seed inicial al iniciar:
- **Usuario Admin**: `admin@padova.local`
- **Contraseña**: `admin123`

---

## Documentación y despliegue

- Consulta **[planilla-docs](https://github.com/djfernandez/planilla-docs)** para diagramas de arquitectura C4 (contexto, contenedores, componentes), diagramas de secuencia detallados y el modelo relacional.
- Consulta **[planilla-terraform](https://github.com/djfernandez/planilla-terraform)** para desplegar la arquitectura completa en Azure con VNet privada, Container Apps y Key Vault.
