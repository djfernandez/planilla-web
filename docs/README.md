# Documentación de Planilla Web

Documentación técnica de la arquitectura del sistema. Los diagramas usan [Mermaid](https://mermaid.js.org/), que GitHub, GitLab y la vista previa de Markdown de VS Code renderizan directamente.

| Documento | Contenido |
|-----------|-----------|
| [arquitectura-c4.md](arquitectura-c4.md) | Modelo C4: contexto, contenedores, componentes de la API y despliegue |
| [secuencias.md](secuencias.md) | Diagramas de secuencia de los flujos principales |
| [modelo-datos.md](modelo-datos.md) | Diagrama entidad-relación del esquema Prisma |

## Notación C4

El [modelo C4](https://c4model.com/) describe la arquitectura en niveles de zoom:

1. **Contexto**: el sistema como caja negra, sus usuarios y sistemas externos.
2. **Contenedores**: aplicaciones y almacenes de datos que se despliegan por separado.
3. **Componentes**: módulos internos de un contenedor (aquí, la API NestJS).
4. **Código**: no se documenta. El código fuente y el [modelo de datos](modelo-datos.md) cumplen ese rol.

> Los diagramas C4 usan la sintaxis nativa de Mermaid (`C4Context`, `C4Container`, `C4Component`, `C4Deployment`), que todavía es experimental. Si un visor no la soporta, se puede pegar el bloque en https://mermaid.live.

## Mantenimiento

Actualiza estos documentos cuando cambien:

- servicios, puertos o volúmenes en `docker-compose.yml`
- módulos de `backend/src/app.module.ts` o rutas de los controladores
- el esquema `backend/prisma/schema.prisma`
- flujos de negocio (tope diario, V°B°, pagos, consentimiento)
