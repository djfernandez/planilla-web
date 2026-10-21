// Pruebas de reglas de Firestore (planilla web). Corren contra el emulador local.
// Ejecutar desde la raíz del proyecto: npm --prefix tests test
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const here = path.dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(path.join(here, '..', 'firestore.rules'), 'utf8');

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-planilla-web',
    firestore: { rules },
  });
});

after(async () => { await env.cleanup(); });

// Datos base: un admin, dos usuarios de obra, un aprobador del área "obra", un usuario inactivo y una planilla.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin1'), { rol: 'ADMIN', areaId: 'administrativo', nombres: 'ADMIN' });
    await setDoc(doc(db, 'users/user1'), { rol: 'USUARIO', areaId: 'obra', nombres: 'USER1' });
    await setDoc(doc(db, 'users/user2'), { rol: 'USUARIO', areaId: 'obra', nombres: 'USER2' });
    await setDoc(doc(db, 'users/aprob'), { rol: 'USUARIO', areaId: 'administrativo', nombres: 'APROB' });
    await setDoc(doc(db, 'users/inactivo'), { rol: 'USUARIO', areaId: 'obra', activo: false });
    await setDoc(doc(db, 'users/admin2'), { rol: 'ADMIN', areaId: 'administrativo', activo: false });
    await setDoc(doc(db, 'users/cc0'), { rol: 'USUARIO', areaId: 'obra' });
    await setDoc(doc(db, 'users/cc1'), { rol: 'USUARIO', areaId: 'obra', cajaChicaActivo: true });
    await setDoc(doc(db, 'cajasChicasHistorial/c1'), { userId: 'cc1', monto: 10 });
    await setDoc(doc(db, 'areas/obra'), { nombre: 'Obra', approverUid: 'aprob' });
    await setDoc(doc(db, 'empresas/EMP01'), { razon: 'Empresa 1' });
    await setDoc(doc(db, 'history/h1'), { userId: 'user1', areaId: 'obra', monto: 100, pagado: false, comprobantes: [] });
    await setDoc(doc(db, 'history/h5'), { userId: 'inactivo', areaId: 'obra', monto: 50, pagado: false, comprobantes: [] });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('Sin sesión', () => {
  it('no lee usuarios, historial ni empresas', async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, 'users/user1')));
    await assertFails(getDoc(doc(db, 'history/h1')));
    await assertFails(getDoc(doc(db, 'empresas/EMP01')));
  });
});

describe('Usuarios (users/{uid})', () => {
  it('cada usuario lee su propio perfil', async () => {
    await assertSucceeds(getDoc(doc(as('user1'), 'users/user1')));
  });

  it('un usuario no lee el perfil de otro', async () => {
    await assertFails(getDoc(doc(as('user1'), 'users/user2')));
  });

  it('el admin lee cualquier perfil', async () => {
    await assertSucceeds(getDoc(doc(as('admin1'), 'users/user2')));
  });

  it('el usuario puede editar sus datos no sensibles', async () => {
    await assertSucceeds(updateDoc(doc(as('user1'), 'users/user1'), { nombres: 'USER1 EDITADO' }));
  });

  it('el usuario NO puede elevarse a ADMIN', async () => {
    await assertFails(updateDoc(doc(as('user1'), 'users/user1'), { rol: 'ADMIN' }));
  });

  it('el usuario NO puede cambiar su propia área', async () => {
    await assertFails(updateDoc(doc(as('user1'), 'users/user1'), { areaId: 'administrativo' }));
  });

  it('un usuario NO puede editar el perfil de otro', async () => {
    await assertFails(updateDoc(doc(as('user1'), 'users/user2'), { nombres: 'HACKEADO' }));
  });

  it('el admin cambia rol y área de cualquier usuario', async () => {
    await assertSucceeds(updateDoc(doc(as('admin1'), 'users/user2'), { rol: 'ADMIN', areaId: 'administrativo' }));
  });

  it('solo el admin crea usuarios', async () => {
    await assertFails(setDoc(doc(as('user1'), 'users/nuevo'), { rol: 'USUARIO' }));
    await assertSucceeds(setDoc(doc(as('admin1'), 'users/nuevo'), { rol: 'USUARIO' }));
  });

  it('solo el admin borra usuarios', async () => {
    await assertFails(deleteDoc(doc(as('user1'), 'users/user2')));
    await assertSucceeds(deleteDoc(doc(as('admin1'), 'users/user2')));
  });
});

describe('Empresas y áreas', () => {
  it('cualquier autenticado lee empresas; solo el admin escribe', async () => {
    await assertSucceeds(getDoc(doc(as('user1'), 'empresas/EMP01')));
    await assertFails(setDoc(doc(as('user1'), 'empresas/EMP02'), { razon: 'X' }));
    await assertSucceeds(setDoc(doc(as('admin1'), 'empresas/EMP02'), { razon: 'X' }));
  });

  it('solo el admin modifica áreas (y por tanto aprobadores)', async () => {
    await assertFails(updateDoc(doc(as('user1'), 'areas/obra'), { approverUid: 'user1' }));
    await assertSucceeds(updateDoc(doc(as('admin1'), 'areas/obra'), { approverUid: 'aprob' }));
  });
});

describe('Historial de planillas (history)', () => {
  it('el dueño crea su planilla', async () => {
    await assertSucceeds(setDoc(doc(as('user1'), 'history/h2'), { userId: 'user1', areaId: 'obra', monto: 10 }));
  });

  it('un usuario NO crea planillas a nombre de otro', async () => {
    await assertFails(setDoc(doc(as('user1'), 'history/h3'), { userId: 'user2', areaId: 'obra', monto: 10 }));
  });

  it('un usuario NO lee planillas de otro si no es aprobador', async () => {
    await assertFails(getDoc(doc(as('user2'), 'history/h1')));
  });

  it('el aprobador del área lee las planillas de esa área', async () => {
    await assertSucceeds(getDoc(doc(as('aprob'), 'history/h1')));
  });

  it('el aprobador puede dar VB (solo campos vb*)', async () => {
    await assertSucceeds(updateDoc(doc(as('aprob'), 'history/h1'), { vbOk: true, vbByUid: 'aprob', vbAt: new Date() }));
  });

  it('el aprobador NO puede cambiar el monto', async () => {
    await assertFails(updateDoc(doc(as('aprob'), 'history/h1'), { monto: 999 }));
  });

  it('el admin agrega comprobantes solo si la planilla queda pagada', async () => {
    const comp = [{ url: 'x.pdf' }];
    await assertFails(updateDoc(doc(as('admin1'), 'history/h1'), { comprobantes: comp }));
    await assertSucceeds(updateDoc(doc(as('admin1'), 'history/h1'), { comprobantes: comp, pagado: true }));
  });

  it('un usuario NO borra planillas; solo el admin', async () => {
    await assertFails(deleteDoc(doc(as('user1'), 'history/h1')));
    await assertSucceeds(deleteDoc(doc(as('admin1'), 'history/h1')));
  });
});

describe('Activar / desactivar usuarios (campo activo)', () => {
  it('un usuario inactivo NO lee sus propias planillas', async () => {
    await assertFails(getDoc(doc(as('inactivo'), 'history/h5')));
  });

  it('un usuario inactivo NO escribe planillas', async () => {
    await assertFails(setDoc(doc(as('inactivo'), 'history/h4'), { userId: 'inactivo', areaId: 'obra', monto: 1 }));
  });

  it('un usuario inactivo SÍ lee su propio perfil (para ver el aviso de desactivación)', async () => {
    await assertSucceeds(getDoc(doc(as('inactivo'), 'users/inactivo')));
  });

  it('un usuario NO puede reactivarse a sí mismo', async () => {
    await assertFails(updateDoc(doc(as('inactivo'), 'users/inactivo'), { activo: true }));
  });

  it('un usuario activo NO puede desactivarse a sí mismo', async () => {
    await assertFails(updateDoc(doc(as('user1'), 'users/user1'), { activo: false }));
  });

  it('un admin inactivo pierde sus privilegios (no lee perfiles de otros)', async () => {
    await assertFails(getDoc(doc(as('admin2'), 'users/user1')));
  });

  it('el admin activo desactiva a un usuario', async () => {
    await assertSucceeds(updateDoc(doc(as('admin1'), 'users/user2'), { activo: false }));
  });

  it('el admin activo reactiva a un usuario', async () => {
    await assertSucceeds(updateDoc(doc(as('admin1'), 'users/inactivo'), { activo: true }));
  });
});

describe('Acceso a Caja Chica (cajaChicaActivo)', () => {
  it('un usuario SIN habilitación no lee Caja Chica', async () => {
    await assertFails(getDoc(doc(as('cc0'), 'cajasChicasHistorial/c1')));
  });

  it('un usuario SIN habilitación no escribe Caja Chica', async () => {
    await assertFails(setDoc(doc(as('cc0'), 'cajasChicasHistorial/c2'), { userId: 'cc0' }));
  });

  it('un usuario habilitado (cajaChicaActivo true) sí accede', async () => {
    await assertSucceeds(getDoc(doc(as('cc1'), 'cajasChicasHistorial/c1')));
  });

  it('el admin accede a Caja Chica aunque no tenga el flag', async () => {
    await assertSucceeds(getDoc(doc(as('admin1'), 'cajasChicasHistorial/c1')));
  });

  it('un usuario sin habilitación SIGUE pudiendo usar la planilla', async () => {
    await assertSucceeds(setDoc(doc(as('cc0'), 'history/h9'), { userId: 'cc0', areaId: 'obra', monto: 5 }));
  });
});

describe('Hardening: campos sensibles del perfil', () => {
  it('un usuario NO puede habilitarse a sí mismo en Caja Chica', async () => {
    await assertFails(updateDoc(doc(as('cc0'), 'users/cc0'), { cajaChicaActivo: true }));
  });

  it('el admin SÍ habilita a un usuario en Caja Chica', async () => {
    await assertSucceeds(updateDoc(doc(as('admin1'), 'users/cc0'), { cajaChicaActivo: true }));
  });
});

describe('Configuración (config/movilidades)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'config/movilidades'), { partidas: ['94301'] });
    });
  });

  it('cualquier usuario activo lee la configuración de movilidades', async () => {
    await assertSucceeds(getDoc(doc(as('user1'), 'config/movilidades')));
  });

  it('un usuario NO puede cambiar la configuración de movilidades', async () => {
    await assertFails(setDoc(doc(as('user1'), 'config/movilidades'), { partidas: ['1'] }));
  });

  it('el admin SÍ cambia la configuración de movilidades', async () => {
    await assertSucceeds(setDoc(doc(as('admin1'), 'config/movilidades'), { partidas: ['94301', '95301'] }, { merge: true }));
  });

  it('un usuario inactivo NO lee la configuración', async () => {
    await assertFails(getDoc(doc(as('inactivo'), 'config/movilidades')));
  });
});

describe('Riesgos detectados en reglas actuales', () => {
  it('contadores de serie: solo el admin debería escribir', { todo: 'counters abierto a todo autenticado' }, async () => {
    await assertFails(setDoc(doc(as('user1'), 'counters/12345678'), { n: 999 }));
  });
});
