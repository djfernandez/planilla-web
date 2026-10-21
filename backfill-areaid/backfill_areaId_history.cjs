// backfill_areaId_history.cjs
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Ejecuta con: node backfill_areaId_history.cjs --dry-run
const DRY_RUN = process.argv.includes("--dry-run");

// Si quieres usar otra ruta: SERVICE_ACCOUNT=./otro.json node backfill_areaId_history.cjs
const SERVICE_ACCOUNT_PATH =
  process.env.SERVICE_ACCOUNT || "./serviceAccountKey.json";

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(
    `No encuentro el service account en: ${SERVICE_ACCOUNT_PATH}\n` +
      `Coloca el archivo serviceAccountKey.json en esta carpeta o usa:\n` +
      `SERVICE_ACCOUNT=./ruta.json node backfill_areaId_history.cjs`
  );
  process.exit(1);
}

const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const PAGE_SIZE = 1000; // documentos por página (lectura)
const BATCH_SIZE = 450; // escrituras por batch (máx 500)

async function main() {
  console.log("=== BACKFILL areaId en history ===");
  console.log("DRY_RUN:", DRY_RUN);

  // 1) Cargar mapa users(uid) -> areaId
  console.log("Cargando usuarios...");
  const usersSnap = await db.collection("users").get();
  const userAreaMap = new Map();
  usersSnap.forEach((d) => {
    const u = d.data() || {};
    if (u.areaId) userAreaMap.set(d.id, u.areaId);
  });

  console.log(
    `Usuarios leídos: ${usersSnap.size} | con areaId: ${userAreaMap.size}`
  );

  // 2) Paginación por history
  let lastDoc = null;
  let totalScanned = 0;
  let totalUpdated = 0;
  let totalSkippedNoUserId = 0;
  let totalSkippedNoArea = 0;

  while (true) {
    let q = db
      .collection("history")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);

    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    let batch = db.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      totalScanned++;
      const h = docSnap.data() || {};

      // Ya tiene areaId -> no tocar
      if (h.areaId) continue;

      // Necesitamos userId para mapear
      const uid = h.userId;
      if (!uid) {
        totalSkippedNoUserId++;
        continue;
      }

      const areaId = userAreaMap.get(uid);
      if (!areaId) {
        totalSkippedNoArea++;
        continue;
      }

      totalUpdated++;

      if (!DRY_RUN) {
        batch.update(docSnap.ref, { areaId });
        ops++;

        if (ops >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
    }

    if (!DRY_RUN && ops > 0) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    console.log(
      `Página OK | scanned=${totalScanned} updated=${totalUpdated} skippedNoUserId=${totalSkippedNoUserId} skippedNoArea=${totalSkippedNoArea}`
    );
  }

  console.log("=== FIN ===");
  console.log({
    DRY_RUN,
    totalScanned,
    totalUpdated,
    totalSkippedNoUserId,
    totalSkippedNoArea,
  });
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
