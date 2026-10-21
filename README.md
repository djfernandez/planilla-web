# Planilla Web — Planilla de Movilidad

Aplicación web interna de Grupo Padova para registrar, aprobar y sustentar **planillas de movilidad** de los trabajadores, con firma digital y generación de PDF. Comparte el proyecto Firebase con **Caja Chica Web**, por lo que las reglas de Firestore y Storage de este repo cubren ambos sistemas.

- **Producción:** https://planilla-webg.web.app
- **Proyecto Firebase:** `planilla-webg`

## Funcionalidades

- **Nueva planilla:** el trabajador registra sus desplazamientos y genera el PDF numerado con su rúbrica.
- **Historial:** cada usuario ve sus planillas; el aprobador del área da el V°B°; el ADMIN ve todo, marca pagos y adjunta comprobantes.
- **Ajustes (solo ADMIN):** empresas, usuarios, áreas, aprobadores y partidas.
- **Exportación** a Excel y PDF.
- **Consentimiento** de uso de rúbrica digital.
- **Login** con correo/clave o cuenta Microsoft.

## Arquitectura

| Capa | Tecnología |
|---|---|
| Frontend | JavaScript vanilla, CSS y Vite; sin framework de UI |
| Backend | Node.js 20+, Express y Firebase Admin |
| Identidad | Firebase Authentication en el navegador; el backend verifica ID tokens |
| Datos y archivos | Cloud Firestore y Cloud Storage, accedidos por el backend |
| Hosting/API | Firebase Hosting y Cloud Functions for Firebase |

El cliente conserva Firebase Authentication para iniciar sesión. Toda lectura o escritura de Firestore y Storage de esta aplicación pasa por `/api`; Express verifica el token, consulta el perfil y aplica las autorizaciones por rol/área antes de usar Firebase Admin. La carga inicial de datos se actualiza mediante solicitudes livianas periódicas. Las reglas existentes de Firestore y Storage se mantienen para Caja Chica Web y otros clientes.

Las bibliotecas grandes de PDF y Excel se cargan solo cuando se usan. El CSS y JavaScript propios se minifican al compilar el frontend.

## Estructura

```text
.
├── frontend/
│   ├── index.html
│   ├── css/app.css
│   ├── js/app.js
│   ├── js/api.js
│   └── vite.config.js
├── backend/
│   ├── controllers/       # Perfiles, catálogos, historial y archivos
│   ├── middleware/        # Verificación de identidad/estado
│   ├── models/            # Acceso y serialización de Firestore
│   ├── routes/
│   └── index.js           # Función HTTP de Express
├── firestore.rules
├── storage.rules
├── firebase.json
├── tests/                 # Pruebas de reglas de Firestore
└── backfill-areaid/       # Script de mantenimiento puntual
```

## Desarrollo local

Requisitos: Node.js 20+, Firebase CLI y Java 11+ para los emuladores.

Instala dependencias y compila:

```bash
npm --prefix backend install
npm --prefix frontend install
npm run build
```

Para desarrollar la interfaz, abre dos terminales:

```bash
firebase emulators:start --only auth,firestore,storage --project demo-planilla-web
```

```powershell
$env:GCLOUD_PROJECT = "demo-planilla-web"
$env:FIREBASE_CONFIG = '{"projectId":"demo-planilla-web","storageBucket":"demo-planilla-web.appspot.com"}'
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199"
npm run start:backend
```

En otra terminal, arranca el frontend:

```bash
npm run dev:frontend
```

Vite sirve el frontend y reenvía `/api` al Express local en `http://localhost:3000`. En modo desarrollo, Firebase Authentication usa el emulador. Crea un usuario de prueba y su perfil `users/{uid}` en los emuladores antes de iniciar sesión. Así, las lecturas y escrituras permanecen aisladas del proyecto productivo.

Crea antes un usuario de prueba en el emulador de Auth y registra su perfil con el mismo UID en el emulador de Firestore. Si el backend usa variables de entorno fuera de PowerShell, define los equivalentes en la shell correspondiente.

No uses credenciales de cuenta de servicio en el repositorio. Las credenciales locales deben mantenerse fuera del proyecto y el servidor desplegado utiliza su identidad de servicio.

### Pruebas

Pruebas HTTP del backend:

```bash
npm --prefix backend test
```

Pruebas de reglas de Firestore:

```bash
npm --prefix tests install
npm --prefix tests test
```

Las pruebas de reglas usan el emulador y un proyecto `demo-`; no modifican datos reales.

## Despliegue

```bash
npm run deploy
```

El comando compila el frontend y despliega Hosting y la función Express. Para desplegar reglas por separado:

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
```

Corre las pruebas de reglas antes de desplegarlas: las reglas son compartidas con Caja Chica Web. El backend de Cloud Functions requiere un proyecto Firebase habilitado para despliegues de funciones y permisos de servicio para Firestore y Storage.

Para cambiar el dominio de Storage, actualiza el CORS del bucket:

```bash
gsutil cors set cors.json gs://planilla-webg.firebasestorage.app
```

## Modelo de datos (Firestore)

| Colección | Uso |
|---|---|
| `users/{uid}` | Perfil, rol, área, estado y proyectos |
| `areas/{id}` | Área y su aprobador (`approverUid`) |
| `empresas/{id}` | Razón social, RUC, dirección y logo |
| `proyectos/{id}`, `partidasContables/{id}` | Catálogos |
| `config/{docId}` | Configuración general |
| `history/{id}` | Líneas de planillas, aprobación y pago |
| `counters/{dni}` | Correlativo por trabajador |
| `cajasChicas*` | Colecciones de Caja Chica Web |

## Seguridad

- El backend no confía en el rol enviado por el navegador: obtiene el perfil en Firestore y valida permisos en cada operación.
- No se distribuyen credenciales de Firebase Admin. No subir claves de cuenta de servicio, `.env` ni exportaciones con datos personales.
- La configuración web de Firebase (`apiKey`, `appId`, etc.) identifica la aplicación y no sustituye las autorizaciones del backend ni las reglas.
- Las reglas de Firestore y Storage siguen siendo necesarias para Caja Chica Web y otros clientes Firebase.

## Script de mantenimiento: `backfill-areaid`

Completa `areaId` en documentos históricos usando el área actual del usuario.

```bash
cd backfill-areaid
npm install
# Coloca serviceAccountKey.json fuera del repositorio o usa SERVICE_ACCOUNT=./ruta.json
npm run dry-run
npm start
```

## Licencia

Uso interno de Grupo Padova. No redistribuir.
