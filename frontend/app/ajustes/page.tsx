'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { BANCOS, MONEDAS, type Area, type Empresa, type Partida, type Usuario } from '@/lib/types';

const TABS = [
  ['usuarios', 'Usuarios'],
  ['movilidades', 'Movilidades'],
  ['partidas', 'Partidas contables'],
  ['areas', 'Áreas y permisos'],
  ['empresas', 'Empresas'],
] as const;

export default function AjustesPage() {
  return (
    <Shell admin>
      <Ajustes />
    </Shell>
  );
}

function Ajustes() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('usuarios');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [codigos, setCodigos] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function load() {
    const [users, emps, ars, pcs, mov] = await Promise.all([
      api<Usuario[]>('/api/usuarios'),
      api<Empresa[]>('/api/empresas'),
      api<Area[]>('/api/areas'),
      api<Partida[]>('/api/partidas'),
      api<{ codigos: string[] }>('/api/movilidades'),
    ]);
    setUsuarios(users);
    setEmpresas(emps);
    setAreas(ars);
    setPartidas(pcs);
    setCodigos(mov.codigos);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const activos = usuarios.filter((user) => user.activo).length;
  const admins = usuarios.filter((user) => user.activo && user.rol === 'ADMIN').length;

  return (
    <div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-icon blue">👥</div>
          <div className="kpi-body"><b>{activos}</b><span>Usuarios activos</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-icon cyan">🛡️</div>
          <div className="kpi-body"><b>{admins}</b><span>Administradores activos</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-icon green">📋</div>
          <div className="kpi-body"><b>{codigos.length}</b><span>Partidas de movilidades</span></div>
        </div>
      </div>
      <nav className="inner-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`inner-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {error && <p className="error">{error}</p>}
      {tab === 'usuarios' && <Usuarios usuarios={usuarios} empresas={empresas} areas={areas} onSaved={load} onError={setError} />}
      {tab === 'movilidades' && <Movilidades codigos={codigos} partidas={partidas} onSaved={load} onError={setError} />}
      {tab === 'partidas' && <Partidas partidas={partidas} onSaved={load} onError={setError} />}
      {tab === 'areas' && <Areas areas={areas} usuarios={usuarios} onSaved={load} onError={setError} />}
      {tab === 'empresas' && <Empresas empresas={empresas} onSaved={load} onError={setError} />}
    </div>
  );
}

function Usuarios({ usuarios, empresas, areas, onSaved, onError }: {
  usuarios: Usuario[];
  empresas: Empresa[];
  areas: Area[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [nuevo, setNuevo] = useState({ email: '', password: '', nombres: '', apellidos: '', dni: '' });
  const visibles = useMemo(() => usuarios.filter((user) => {
    const text = `${user.nombres} ${user.apellidos} ${user.dni} ${user.email}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (filtro === 'activos') return user.activo;
    if (filtro === 'inactivos') return !user.activo;
    if (filtro === 'admins') return user.rol === 'ADMIN';
    return true;
  }), [usuarios, q, filtro]);

  async function crear(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/api/usuarios', { method: 'POST', body: JSON.stringify(nuevo) });
      setNuevo({ email: '', password: '', nombres: '', apellidos: '', dni: '' });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
    }
  }

  return (
    <div>
      <p className="hint">El administrador crea la cuenta y asigna la clave. No hay recuperación por correo.</p>
      <form className="row" onSubmit={crear}>
        <input placeholder="Nombres" value={nuevo.nombres} onChange={(e) => setNuevo({ ...nuevo, nombres: e.target.value })} required />
        <input placeholder="Apellidos" value={nuevo.apellidos} onChange={(e) => setNuevo({ ...nuevo, apellidos: e.target.value })} required />
        <input placeholder="DNI" value={nuevo.dni} onChange={(e) => setNuevo({ ...nuevo, dni: e.target.value })} required />
        <input type="email" placeholder="Correo" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} required />
        <input type="password" placeholder="Clave inicial" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} required minLength={8} />
        <button className="btn primary">Crear usuario</button>
      </form>
      <div className="row" style={{ margin: '12px 0' }}>
        <input placeholder="Buscar por nombre, DNI o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
          <option value="admins">Solo ADMIN</option>
        </select>
        <span className="hint">{visibles.length} usuarios</span>
      </div>
      <div className="table-wrap">
        {visibles.map((user) => <UsuarioRow key={user.id} user={user} empresas={empresas} areas={areas} onSaved={onSaved} onError={onError} />)}
      </div>
    </div>
  );
}

function UsuarioRow({ user, empresas, areas, onSaved, onError }: {
  user: Usuario;
  empresas: Empresa[];
  areas: Area[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    ...user,
    proyectos: user.proyectos.join(', '),
    emailTo: user.emailTo.join(', '),
    emailCc: user.emailCc.join(', '),
  });
  const [clave, setClave] = useState('');

  async function guardar() {
    try {
      await api(`/api/usuarios/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombres: form.nombres,
          apellidos: form.apellidos,
          dni: form.dni,
          rol: form.rol,
          empresaId: form.empresaId || null,
          areaId: form.areaId || null,
          proyDef: form.proyDef,
          proyectos: form.proyectos.split(',').map((item) => item.trim()).filter(Boolean),
          emailTo: form.emailTo.split(',').map((item) => item.trim()).filter(Boolean),
          emailCc: form.emailCc.split(',').map((item) => item.trim()).filter(Boolean),
          bank: form.bank,
          accountNumber: form.accountNumber,
          currency: form.currency,
          activo: form.activo,
        }),
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo guardar el usuario.');
    }
  }

  return (
    <div className="card" style={{ opacity: form.activo ? 1 : 0.6 }}>
      <div className="card-b row">
        <input value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
        <input value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
        <input value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} />
        <select value={form.empresaId || ''} onChange={(e) => setForm({ ...form, empresaId: e.target.value || null })}>
          <option value="">(sin empresa)</option>
          {empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.razon}</option>)}
        </select>
        <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Usuario['rol'] })}>
          <option value="USUARIO">USUARIO</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select value={form.areaId || ''} onChange={(e) => setForm({ ...form, areaId: e.target.value || null })}>
          <option value="">(sin área)</option>
          {areas.map((area) => <option key={area.id} value={area.id}>{area.nombre}</option>)}
        </select>
        <select value={String(form.activo)} onChange={(e) => setForm({ ...form, activo: e.target.value === 'true' })}>
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
        <input placeholder="Proyecto por defecto" value={form.proyDef} onChange={(e) => setForm({ ...form, proyDef: e.target.value })} />
        <input placeholder="Proyectos, separados por coma" value={form.proyectos} onChange={(e) => setForm({ ...form, proyectos: e.target.value })} />
        <input placeholder="Correos Para" value={form.emailTo} onChange={(e) => setForm({ ...form, emailTo: e.target.value })} />
        <input placeholder="Correos CC" value={form.emailCc} onChange={(e) => setForm({ ...form, emailCc: e.target.value })} />
        <select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
          {BANCOS.map((banco) => <option key={banco}>{banco}</option>)}
        </select>
        <input placeholder="N° cuenta" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          {MONEDAS.map((moneda) => <option key={moneda}>{moneda}</option>)}
        </select>
        <button className="btn primary small" onClick={guardar}>Guardar</button>
        {user.hasConsentimiento && <a className="btn small" href={`/api/usuarios/${user.id}/consentimiento`} target="_blank" rel="noreferrer">Consentimiento</a>}
        <button className="btn small" onClick={async () => {
          if (!confirm(`¿Pedir de nuevo la rúbrica a ${user.nombres}?`)) return;
          try {
            await api(`/api/usuarios/${user.id}/reset-consentimiento`, { method: 'POST' });
            await onSaved();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'No se pudo resetear.');
          }
        }}>Reset rúbrica</button>
        <input type="password" placeholder="Nueva clave" value={clave} onChange={(e) => setClave(e.target.value)} />
        <button className="btn small" onClick={async () => {
          try {
            await api(`/api/usuarios/${user.id}/clave`, { method: 'PATCH', body: JSON.stringify({ password: clave }) });
            setClave('');
            alert('Clave actualizada.');
          } catch (err) {
            onError(err instanceof Error ? err.message : 'No se pudo cambiar la clave.');
          }
        }}>Asignar clave</button>
      </div>
    </div>
  );
}

function Movilidades({ codigos, partidas, onSaved, onError }: { codigos: string[]; partidas: Partida[]; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [lista, setLista] = useState(codigos);
  const [codigo, setCodigo] = useState('');
  useEffect(() => setLista(codigos), [codigos]);
  return (
    <div>
      <p className="hint">Partidas que ven los usuarios. Los administradores ven todas.</p>
      <div className="row">
        {lista.map((item) => <button key={item} className="btn small" onClick={() => setLista(lista.filter((code) => code !== item))}>{item} ×</button>)}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input list="pcs" placeholder="Código de partida" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        <datalist id="pcs">{partidas.map((pc) => <option key={pc.codigo} value={pc.codigo} />)}</datalist>
        <button className="btn small" onClick={() => { if (codigo.trim()) setLista([...lista, codigo.trim()]); setCodigo(''); }}>Agregar</button>
        <button className="btn primary small" onClick={async () => {
          try {
            await api('/api/movilidades', { method: 'PUT', body: JSON.stringify({ codigos: lista }) });
            await onSaved();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'No se pudo guardar.');
          }
        }}>Guardar cambios</button>
      </div>
    </div>
  );
}

function Partidas({ partidas, onSaved, onError }: { partidas: Partida[]; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  return (
    <div>
      <div className="row">
        <input placeholder="Nuevo código PC" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        <input placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <button className="btn primary small" onClick={async () => {
          try {
            await api('/api/partidas', { method: 'POST', body: JSON.stringify({ codigo, descripcion }) });
            setCodigo('');
            setDescripcion('');
            await onSaved();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'No se pudo agregar.');
          }
        }}>Agregar</button>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const XLSX = await import('xlsx');
          const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(book.Sheets[book.SheetNames[0]], { defval: '' });
          const items = rows.map((row) => ({
            codigo: String(row.PC || row.pc || row.Codigo || row.codigo || '').trim(),
            descripcion: String(row.Descripcion || row.descripcion || row.Descripción || '').trim(),
          })).filter((item) => item.codigo);
          try {
            await api('/api/partidas/importar', { method: 'POST', body: JSON.stringify({ items }) });
            await onSaved();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'No se pudo importar.');
          }
        }} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>PC</th><th>Descripción</th><th></th></tr></thead>
          <tbody>
            {partidas.map((pc) => <PartidaRow key={pc.codigo} pc={pc} onSaved={onSaved} onError={onError} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PartidaRow({ pc, onSaved, onError }: { pc: Partida; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [descripcion, setDescripcion] = useState(pc.descripcion);
  return (
    <tr>
      <td>{pc.codigo}</td>
      <td><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></td>
      <td>
        <button className="btn small" onClick={async () => {
          try {
            await api(`/api/partidas/${encodeURIComponent(pc.codigo)}`, { method: 'PATCH', body: JSON.stringify({ descripcion }) });
            await onSaved();
          } catch (err) { onError(err instanceof Error ? err.message : 'Error'); }
        }}>Guardar</button>
        <button className="btn small danger" onClick={async () => {
          try {
            await api(`/api/partidas/${encodeURIComponent(pc.codigo)}`, { method: 'DELETE' });
            await onSaved();
          } catch (err) { onError(err instanceof Error ? err.message : 'Error'); }
        }}>Eliminar</button>
      </td>
    </tr>
  );
}

function Areas({ areas, usuarios, onSaved, onError }: { areas: Area[]; usuarios: Usuario[]; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [nuevo, setNuevo] = useState({ id: '', nombre: '', prefixes: '', ids: '' });
  return (
    <div>
      <div className="row">
        <input placeholder="ID área (ej. marketing)" value={nuevo.id} onChange={(e) => setNuevo({ ...nuevo, id: e.target.value })} />
        <input placeholder="Nombre visible" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <input placeholder="Prefijos, separados por coma" value={nuevo.prefixes} onChange={(e) => setNuevo({ ...nuevo, prefixes: e.target.value })} />
        <input placeholder="IDs exactos, separados por coma" value={nuevo.ids} onChange={(e) => setNuevo({ ...nuevo, ids: e.target.value })} />
        <button className="btn primary small" onClick={async () => {
          try {
            await api('/api/areas', {
              method: 'POST',
              body: JSON.stringify({
                id: nuevo.id.trim().toLowerCase(),
                nombre: nuevo.nombre,
                allowedPrefixes: nuevo.prefixes.split(',').map((item) => item.trim()).filter(Boolean),
                allowedIds: nuevo.ids.split(',').map((item) => item.trim()).filter(Boolean),
              }),
            });
            setNuevo({ id: '', nombre: '', prefixes: '', ids: '' });
            await onSaved();
          } catch (err) { onError(err instanceof Error ? err.message : 'No se pudo crear el área.'); }
        }}>Agregar</button>
      </div>
      {areas.map((area) => <AreaRow key={area.id} area={area} usuarios={usuarios} onSaved={onSaved} onError={onError} />)}
    </div>
  );
}

function AreaRow({ area, usuarios, onSaved, onError }: { area: Area; usuarios: Usuario[]; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [nombre, setNombre] = useState(area.nombre);
  const [approverId, setApproverId] = useState(area.approverId || '');
  const [prefixes, setPrefixes] = useState(area.allowedPrefixes.join(','));
  const [ids, setIds] = useState(area.allowedIds.join(','));
  return (
    <div className="card"><div className="card-b row">
      <b>{area.id}</b>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <select value={approverId} onChange={(e) => setApproverId(e.target.value)}>
        <option value="">(sin aprobador)</option>
        {usuarios.map((user) => <option key={user.id} value={user.id}>{user.nombres} {user.apellidos}</option>)}
      </select>
      <input value={prefixes} onChange={(e) => setPrefixes(e.target.value)} />
      <input value={ids} onChange={(e) => setIds(e.target.value)} />
      <button className="btn small primary" onClick={async () => {
        try {
          await api(`/api/areas/${area.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              nombre,
              approverId: approverId || null,
              allowedPrefixes: prefixes.split(',').map((item) => item.trim()).filter(Boolean),
              allowedIds: ids.split(',').map((item) => item.trim()).filter(Boolean),
            }),
          });
          await onSaved();
        } catch (err) { onError(err instanceof Error ? err.message : 'Error'); }
      }}>Guardar</button>
      <button className="btn small danger" onClick={async () => {
        try {
          await api(`/api/areas/${area.id}`, { method: 'DELETE' });
          await onSaved();
        } catch (err) { onError(err instanceof Error ? err.message : 'Error'); }
      }}>Eliminar</button>
    </div></div>
  );
}

function Empresas({ empresas, onSaved, onError }: { empresas: Empresa[]; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [razon, setRazon] = useState('');
  const [ruc, setRuc] = useState('');
  const [direccion, setDireccion] = useState('');
  return (
    <div>
      <div className="row">
        <input placeholder="Razón social" value={razon} onChange={(e) => setRazon(e.target.value)} />
        <input placeholder="RUC" value={ruc} onChange={(e) => setRuc(e.target.value)} />
        <input placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        <button className="btn primary small" onClick={async () => {
          try {
            await api('/api/empresas', { method: 'POST', body: JSON.stringify({ razon, ruc, direccion }) });
            setRazon(''); setRuc(''); setDireccion('');
            await onSaved();
          } catch (err) { onError(err instanceof Error ? err.message : 'No se pudo crear la empresa.'); }
        }}>Agregar empresa</button>
      </div>
      {empresas.map((empresa) => <EmpresaRow key={empresa.id} empresa={empresa} onSaved={onSaved} onError={onError} />)}
    </div>
  );
}

function EmpresaRow({ empresa, onSaved, onError }: { empresa: Empresa; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [razon, setRazon] = useState(empresa.razon);
  const [ruc, setRuc] = useState(empresa.ruc);
  const [direccion, setDireccion] = useState(empresa.direccion);
  return (
    <div className="card"><div className="card-b row">
      {empresa.hasLogo && <img alt="" src={`/api/empresas/${empresa.id}/logo`} style={{ height: 36 }} />}
      <input value={razon} onChange={(e) => setRazon(e.target.value)} />
      <input value={ruc} onChange={(e) => setRuc(e.target.value)} />
      <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      <button className="btn small primary" onClick={async () => {
        try {
          await api(`/api/empresas/${empresa.id}`, { method: 'PATCH', body: JSON.stringify({ razon, ruc, direccion }) });
          await onSaved();
        } catch (err) { onError(err instanceof Error ? err.message : 'Error'); }
      }}>Guardar</button>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const form = new FormData();
        form.append('logo', file);
        try {
          await api(`/api/empresas/${empresa.id}/logo`, { method: 'POST', body: form });
          await onSaved();
        } catch (err) { onError(err instanceof Error ? err.message : 'No se pudo subir el logo.'); }
      }} />
    </div></div>
  );
}
