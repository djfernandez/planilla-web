# Modelo de datos

Diagrama entidad-relación generado a partir de `backend/prisma/schema.prisma` (PostgreSQL). Entre paréntesis va el nombre real de la tabla.

```mermaid
erDiagram
  users ||--o{ refresh_tokens : "tiene"
  empresas |o--o{ users : "emplea"
  areas |o--o{ users : "miembros"
  users |o--o{ areas : "aprueba (approverId)"
  users ||--o{ planillas : "emite"
  planillas ||--|{ planilla_lineas : "contiene"
  planillas ||--o{ comprobantes : "adjunta"
  users ||--o{ comprobantes : "sube"

  users {
    uuid id PK
    string email UK
    string passwordHash
    string nombres
    string apellidos
    string dni UK
    enum rol "ADMIN | USUARIO"
    uuid empresaId FK
    string areaId FK
    string proyDef
    string_array proyectos
    string_array emailTo
    string_array emailCc
    string bank
    string accountNumber
    string currency
    boolean activo
    string signaturePath
    string consentPdfPath
    datetime consentAt
  }
  refresh_tokens {
    uuid id PK
    uuid userId FK
    string tokenHash UK "sha256"
    datetime expiresAt
  }
  empresas {
    uuid id PK
    string razon
    string ruc
    string direccion
    string logoPath
  }
  areas {
    string id PK
    string nombre
    uuid approverId FK
    string_array allowedPrefixes
    string_array allowedIds
  }
  planillas {
    uuid id PK
    string serie
    string numero
    date fechaEmision
    datetime fechaRegistro
    uuid userId FK
    string userDni
    string userNombre "desnormalizado"
    string areaId
    string areaNombre "desnormalizado"
    boolean vbOk
    string vbByName
    datetime vbAt
    boolean pagado
    string pagadoByName
    datetime pagadoAt
    string pdfPath
  }
  planilla_lineas {
    uuid id PK
    uuid planillaId FK
    int orden
    string destino
    string motivo
    string proyecto
    string pc "código de partida"
    decimal monto "12,2"
  }
  comprobantes {
    uuid id PK
    uuid planillaId FK
    string originalName
    string storagePath
    uuid uploadedById FK
    datetime uploadedAt
  }
  counters {
    string dni PK
    int count
  }
  partidas_contables {
    string codigo PK
    string descripcion
  }
  movilidad_partidas {
    string codigo PK
  }
```

## Notas

- `counters`, `partidas_contables` y `movilidad_partidas` no tienen claves foráneas. Se relacionan por valor: `counters.dni` con `users.dni`, y `planilla_lineas.pc` con `partidas_contables.codigo` / `movilidad_partidas.codigo`.
- `planillas.areaId` es texto sin FK (por defecto `""`). Se guarda junto con `areaNombre` como copia del momento de la emisión.
- Restricción única `planillas (userDni, serie, numero)`. Índices en `userId`, `areaId` y `fechaEmision`.
- Al borrar una planilla se borran en cascada sus `planilla_lineas` y `comprobantes`. Al borrar un usuario se borran sus `refresh_tokens`.
- Los campos `*Path` guardan rutas relativas a `STORAGE_ROOT` (`firmas/`, `consentimientos/`, `planillas/`, `comprobantes/` y logos).
