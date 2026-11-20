# Diagramas de secuencia

Flujos principales de Planilla Web. Todas las rutas `/api/*` pasan por el proxy de Next.js (`next.config.js`) antes de llegar a la API NestJS. Para simplificar, el proxy se omite salvo en el primer diagrama.

1. [Inicio de sesión](#1-inicio-de-sesión)
2. [Renovación transparente de sesión](#2-renovación-transparente-de-sesión-refresh)
3. [Consentimiento y rúbrica digital](#3-consentimiento-y-rúbrica-digital)
4. [Emisión de una planilla](#4-emisión-de-una-planilla)
5. [V°B°, pago y comprobantes](#5-vb-pago-y-comprobantes)
6. [Exportar PDF + Correo (.eml)](#6-exportar-pdf--correo-eml)

---

## 1. Inicio de sesión

Fuentes: `frontend/app/login/page.tsx`, `frontend/components/AuthProvider.tsx`, `backend/src/auth/auth.service.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant W as Frontend (login/page.tsx)
  participant P as Proxy Next.js
  participant A as AuthController / AuthService
  participant D as PostgreSQL

  U->>W: Ingresa email y clave
  W->>P: POST /api/auth/login {email, password}
  P->>A: POST /api/auth/login
  A->>D: SELECT user WHERE email = lower(trim(email))
  D-->>A: user (passwordHash)
  A->>A: bcrypt.compare(password, passwordHash)
  alt credenciales inválidas
    A-->>W: 401 "Correo o clave incorrectos."
  else válidas
    A->>A: firma JWT {sub: userId} 15 min
    A->>A: genera refresh aleatorio de 48 bytes
    A->>D: INSERT refresh_tokens (sha256(refresh), expira en 7 días)
    A-->>W: 200 {ok} + Set-Cookie access_token, refresh_token (httpOnly, SameSite=Lax)
    W->>A: GET /api/auth/me (cookie access_token)
    A->>D: SELECT user + empresa + area
    A-->>W: perfil (rol, activo, hasRubrica, ...)
    alt sin rúbrica registrada
      W-->>U: Redirige a /consentimiento
    else
      W-->>U: Redirige a /planilla
    end
  end
```

> En cada request protegida, `JwtStrategy` toma el token de la cookie `access_token` (o del header `Bearer`) y vuelve a cargar el usuario desde la BD. `ActiveGuard` rechaza con 403 a los usuarios inactivos.

---

## 2. Renovación transparente de sesión (refresh)

Fuentes: `frontend/lib/api.ts`, `backend/src/auth/auth.service.ts`.

```mermaid
sequenceDiagram
  autonumber
  participant W as Frontend (lib/api.ts)
  participant A as API
  participant D as PostgreSQL

  W->>A: GET /api/planillas (access_token expirado)
  A-->>W: 401
  W->>A: POST /api/auth/refresh (cookie refresh_token)
  A->>D: SELECT refresh_tokens WHERE tokenHash = sha256(token)
  alt no existe o expirado
    A->>D: DELETE token (si existía)
    A-->>W: 401 "Sesión expirada."
    W-->>W: lanza ApiError, AuthProvider deja me = null y Shell redirige a /login
  else válido
    A->>D: DELETE token usado (rotación)
    A->>D: INSERT nuevo refresh token
    A-->>W: 200 + nuevas cookies
    W->>A: Reintenta GET /api/planillas (una sola vez)
    A-->>W: 200 datos
  end
```

---

## 3. Consentimiento y rúbrica digital

Es obligatorio antes de emitir planillas. `Shell` redirige a `/consentimiento` mientras `hasRubrica` sea falso.
Fuentes: `frontend/app/consentimiento/page.tsx`, `frontend/lib/pdf.ts`, `backend/src/users/users.service.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor U as Trabajador
  participant W as Frontend (consentimiento/page.tsx)
  participant A as UsersService
  participant S as StorageService
  participant D as PostgreSQL

  U->>W: Dibuja la rúbrica en el canvas y acepta los términos
  opt la empresa tiene logo
    W->>A: GET /api/empresas/:id/logo
    A-->>W: imagen
  end
  W->>W: generateConsentPdf() con datos, rúbrica y logo
  W->>A: POST /api/usuarios/consentimiento (multipart: firma.png, consentimiento.pdf)
  alt falta algún archivo
    A-->>W: 400 "Falta la rúbrica o el PDF de consentimiento."
  else
    A->>S: save firmas/{userId}.png
    A->>S: save consentimientos/{userId}.pdf
    A->>S: remove firma anterior (si la ruta cambió)
    A->>D: UPDATE users SET signaturePath, consentPdfPath, consentAt
    A-->>W: perfil actualizado
    W->>A: GET /api/auth/me (refresca el contexto)
    W-->>U: Redirige a /planilla
  end
```

---

## 4. Emisión de una planilla

El flujo de negocio principal: el PDF se genera en el navegador y la API valida, numera y aplica el tope diario de S/ 45 por DNI.
Fuentes: `frontend/app/planilla/page.tsx`, `backend/src/planillas/planillas.service.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor U as Trabajador
  participant W as Frontend (planilla/page.tsx)
  participant A as PlanillasService
  participant D as PostgreSQL
  participant S as StorageService

  Note over W,A: Al cargar la página
  W->>A: GET /api/movilidades (partidas habilitadas)
  W->>A: GET /api/planillas/siguiente
  A->>D: SELECT counters WHERE dni
  A-->>W: {serie, numero} (vista previa)
  U->>W: Elige fecha
  W->>A: GET /api/planillas/acumulado?fecha=AAAA-MM-DD
  A->>D: SUM(monto) de las líneas del DNI en esa fecha
  A-->>W: {gastado, tope: 45, disponible}

  U->>W: Completa filas (destino, motivo, proyecto, partida, monto)
  W->>W: Valida en el cliente que gastado + total no supere 45

  U->>W: Guardar
  W->>A: GET /api/planillas/siguiente
  W->>A: GET /api/empresas/:id/logo y GET /api/usuarios/:id/firma
  W->>W: generatePlanillaPdf() con jsPDF
  W->>A: POST /api/planillas (multipart: pdf + payload JSON)

  A->>A: Valida PDF (no vacío, mimetype/extensión)
  A->>D: SELECT user (exige signaturePath)
  A->>A: Valida el payload con class-validator
  A->>D: Partidas permitidas (MovilidadPartida), salvo ADMIN

  rect rgba(16, 185, 129, 0.08)
    Note over A,D: Transacción
    A->>D: pg_advisory_xact_lock(hashtext(dni))
    A->>D: SUM(monto) del día para el DNI
    alt gastado + nuevo supera S/ 45
      A-->>W: 400 "Con este monto superas el tope..."
    else dentro del tope
      A->>D: UPSERT counters (count + 1), número definitivo
      A->>D: SELECT area del usuario
      A->>D: INSERT planilla + planilla_lineas
      A->>D: COMMIT (libera el lock)
    end
  end

  A->>S: save planillas/{userId}/{serie}-{numero}.pdf
  alt error al escribir el archivo
    A->>D: DELETE planilla (compensación)
    A-->>W: 500
  else ok
    A-->>W: 201 planilla
    W-->>U: Redirige a /historial
  end
```

> El número que se ve en el PDF sale de `/siguiente` justo antes de enviar. El número definitivo lo asigna el `UPSERT` de `counters` dentro de la transacción, que el lock serializa por DNI.

---

## 5. V°B°, pago y comprobantes

Fuentes: `frontend/app/historial/page.tsx`, `backend/src/planillas/planillas.service.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor AP as Aprobador de área
  actor AD as Administrador
  participant W as Frontend (historial/page.tsx)
  participant A as PlanillasService
  participant D as PostgreSQL
  participant S as StorageService

  AP->>W: Abre el historial
  W->>A: GET /api/planillas?start&end&areaId&vb&pago&search
  A->>D: SELECT planillas WHERE alcance(usuario) AND filtros
  Note right of A: ADMIN ve todas. Un aprobador ve las propias y las de sus áreas.
  A-->>W: lista de planillas con líneas y comprobantes

  AP->>W: Dar VB
  W->>A: PATCH /api/planillas/:id/vb {valor: true}
  A->>D: SELECT area WHERE id = planilla.areaId
  alt no es ADMIN ni el approverId del área
    A-->>W: 403 "No tienes permisos para dar VB en esta área."
  else autorizado
    A->>D: UPDATE planilla SET vbOk, vbById, vbByName, vbAt
    A-->>W: planilla actualizada
  end

  AD->>W: Marca "Pagado"
  W->>A: PATCH /api/planillas/:id/pago {valor: true}
  A->>A: assertAdmin
  A->>D: UPDATE planilla SET pagado, pagadoById, pagadoByName, pagadoAt
  A-->>W: planilla actualizada

  AD->>W: Adjunta comprobantes (hasta 10 archivos de 15 MB)
  W->>A: POST /api/planillas/:id/comprobantes (multipart)
  alt planilla no pagada
    A-->>W: 400 "Solo se pueden adjuntar comprobantes si la planilla está pagada."
  else
    loop por cada archivo
      A->>S: save comprobantes/{userId}/{serie-numero}/{timestamp}-{nombre}
      A->>D: INSERT comprobantes
    end
    A-->>W: planilla con comprobantes
  end

  AP->>W: Descarga un comprobante
  W->>A: GET /api/comprobantes/:id/archivo
  A->>D: Verifica alcance sobre la planilla
  A->>S: stream del archivo
  A-->>W: attachment
```

---

## 6. Exportar PDF + Correo (.eml)

El sistema no envía correos. El navegador junta los PDFs y genera un `.eml` que el usuario abre en su cliente de correo.
Fuente: `frontend/lib/eml.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor U as Trabajador
  participant W as Frontend (lib/eml.ts)
  participant A as API
  participant M as Cliente de correo

  U->>W: Selecciona planillas y pulsa "PDF+Correo"
  loop por cada planilla seleccionada
    W->>A: GET /api/planillas/:id/pdf
    alt ok
      A-->>W: application/pdf
      W->>W: pdf-lib copia las páginas al PDF consolidado
    else error
      W->>W: agrega la planilla a la lista de omitidas
    end
  end
  W->>W: Descarga reembolso_consolidado_{fecha}.pdf
  W->>W: Arma HTML con totales por proyecto, detalle y datos bancarios
  W->>W: Construye MIME multipart (HTML + PDF adjunto) con To/Cc del perfil
  W-->>U: Descarga el archivo .eml
  U->>M: Abre el .eml, revisa y envía
```

> La exportación a Excel (`xlsx`) del historial también ocurre en el navegador, con los datos que ya devolvió `GET /api/planillas`.
