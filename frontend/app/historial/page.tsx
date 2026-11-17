'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { downloadEml } from '@/lib/eml';
import { formatDate, soles } from '@/lib/format';
import type { Area, Planilla } from '@/lib/types';

export default function HistorialPage() {
  return (
    <Shell>
      <Historial />
    </Shell>
  );
}

function Historial() {
  const { me } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [filters, setFilters] = useState({ start: '', end: '', area: '', vb: 'ALL', pago: 'ALL', search: '' });
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comps, setComps] = useState<Planilla | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    const params = new URLSearchParams();
    if (filters.start) params.set('start', filters.start);
    if (filters.end) params.set('end', filters.end);
    if (filters.area) params.set('areaId', filters.area);
    if (filters.vb !== 'ALL') params.set('vb', filters.vb);
    if (filters.pago !== 'ALL') params.set('pago', filters.pago);
    if (filters.search.trim()) params.set('search', filters.search.trim());
    const query = params.toString();
    const data = await api<Planilla[]>(`/api/planillas${query ? `?${query}` : ''}`);
    setPlanillas(data);
  }

  useEffect(() => {
    if (!me) return;
    api<Area[]>('/api/areas').then(setAreas).catch((err: Error) => setError(err.message));
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const handle = setTimeout(() => {
      load().catch((err: Error) => setError(err.message));
    }, 250);
    return () => clearTimeout(handle);
  }, [me, filters]);

  const isAdmin = me?.rol === 'ADMIN';

  function canApprove(planilla: Planilla) {
    if (!me) return false;
    if (me.rol === 'ADMIN') return true;
    return areas.some((area) => area.id === planilla.areaId && area.approverId === me.id);
  }

  async function act(path: string, body?: unknown, method = 'PATCH') {
    setError('');
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar.');
    }
  }

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const rows = planillas.flatMap((planilla, index) => planilla.lineas.map((linea, lineaIndex) => {
      const record: Record<string, string | number> = {
        Item: index + lineaIndex + 1,
        'Serie-Num': planilla.clave,
        Área: planilla.areaNombre,
        VB: planilla.vbOk ? 'APROBADO' : 'PENDIENTE',
        'VB Por': planilla.vbByName || '',
        Pagado: planilla.pagado ? 'PAGADO' : 'NO PAGADO',
        'Pagado Por': planilla.pagadoByName || '',
        Comprobantes: planilla.comprobantes.length,
        'Fecha Emision': formatDate(planilla.fechaEmision),
        'Fecha Registro': formatDate(planilla.fechaRegistro),
        Proyecto: linea.proyecto,
        Destino: linea.destino,
        Motivo: linea.motivo,
        'Partida Contable (PC)': linea.pc,
        'Monto (S/)': linea.monto,
        'Total Planilla (S/)': planilla.total,
        'URL del PDF': lineaIndex === 0 ? `/api/planillas/${planilla.id}/pdf` : '',
      };
      if (isAdmin) {
        record.Trabajador = planilla.userNombre;
        record.DNI = planilla.userDni;
      }
      return record;
    }));
    if (!rows.length) {
      setError('No hay datos para exportar.');
      return;
    }
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Historial Movilidad');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(book, isAdmin ? `reporte_general_movilidad_${today}.xlsx` : `reporte_${me?.nombres || 'usuario'}_${today}.xlsx`);
  }

  async function correo() {
    if (!me) return;
    const chosen = planillas.filter((planilla) => selected.includes(planilla.id));
    if (!chosen.length) {
      setError('Selecciona al menos una planilla.');
      return;
    }
    setError('');
    setInfo('');
    try {
      const aviso = await downloadEml(me, chosen);
      setInfo(aviso || 'Se descargó el PDF consolidado y el archivo de correo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo armar el correo.');
    }
  }

  const summary = useMemo(() => planillas.reduce((sum, planilla) => sum + planilla.total, 0), [planillas]);
  if (!me) return null;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h2>Historial de Planillas</h2>
          <div className="sub">{planillas.length} planillas · Total {soles(summary)}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn cyan small" onClick={exportExcel}>📥 Exportar Excel</button>
          <button className="btn small" style={{ background: 'rgba(255,255,255,.15)', color: 'white', borderColor: 'transparent' }} onClick={correo}>✉️ PDF+Correo</button>
          {isAdmin && (
            <button
              className={`btn small ${editing ? 'danger' : ''}`}
              style={editing ? {} : { background: 'rgba(255,255,255,.1)', color: 'white', borderColor: 'transparent' }}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? '✕ Cerrar edición' : '✏️ Editar'}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="group"><label>Desde</label><input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></div>
        <div className="group"><label>Hasta</label><input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></div>
        <div className="group"><label>Área</label>
          <select value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })}>
            <option value="">Todas</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.nombre}</option>)}
          </select>
        </div>
        <div className="group"><label>VB</label>
          <select value={filters.vb} onChange={(e) => setFilters({ ...filters, vb: e.target.value })}>
            <option value="ALL">Todos</option><option value="APROBADO">Aprobado</option><option value="PENDIENTE">Pendiente</option>
          </select>
        </div>
        <div className="group"><label>Pago</label>
          <select value={filters.pago} onChange={(e) => setFilters({ ...filters, pago: e.target.value })}>
            <option value="ALL">Todos</option><option value="PAGADO">Pagado</option><option value="NOPAGADO">No pagado</option>
          </select>
        </div>
        <div className="group grow"><label>Buscar</label>
          <input placeholder="Planilla, proyecto, destino, motivo, PC, trabajador…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <button className="btn small" onClick={() => setFilters({ start: '', end: '', area: '', vb: 'ALL', pago: 'ALL', search: '' })}>🔄 Limpiar</button>
      </div>

      {error && <div className="alert danger">⚠️ {error}</div>}
      {info && <div className="alert ok">✅ {info}</div>}

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sel.</th><th>#</th><th>PDF</th><th>Serie-Num</th><th>Área</th><th>VB</th><th>Pago</th><th>Comp.</th>
                <th>F. emisión</th><th>F. registro</th><th>Proyecto</th><th>Destino</th><th>Motivo</th><th>PC</th><th>Monto</th><th>Total</th>
                {isAdmin && <th>Trabajador</th>}
              </tr>
            </thead>
            <tbody>
              {planillas.flatMap((planilla) => planilla.lineas.map((linea, index) => (
                <tr key={linea.id}>
                  {index === 0 && <td rowSpan={planilla.lineas.length}><input type="checkbox" checked={selected.includes(planilla.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, planilla.id] : current.filter((id) => id !== planilla.id))} /></td>}
                  <td>{index + 1}</td>
                  {index === 0 && <>
                    <td rowSpan={planilla.lineas.length}><a href={`/api/planillas/${planilla.id}/pdf`} target="_blank" rel="noreferrer" className="btn xs ghost">📄</a></td>
                    <td rowSpan={planilla.lineas.length} style={{ fontWeight: 600 }}>{planilla.clave}</td>
                    <td rowSpan={planilla.lineas.length}>{planilla.areaNombre || '—'}</td>
                    <td rowSpan={planilla.lineas.length}>
                      <span className={`badge ${planilla.vbOk ? 'ok' : 'warn'}`}>{planilla.vbOk ? '✅ Aprobado' : '⏳ Pendiente'}</span>
                      {planilla.vbByName && <div className="hint" style={{ marginTop: 2 }}>{planilla.vbByName}</div>}
                      {canApprove(planilla) && <button className="btn xs ghost" style={{ marginTop: 4 }} onClick={() => act(`/api/planillas/${planilla.id}/vb`, { valor: !planilla.vbOk })}>{planilla.vbOk ? 'Quitar VB' : 'Dar VB'}</button>}
                    </td>
                    <td rowSpan={planilla.lineas.length}>
                      {isAdmin ? <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={planilla.pagado} onChange={(e) => act(`/api/planillas/${planilla.id}/pago`, { valor: e.target.checked })} style={{ width: 'auto' }} /> </label> : null}
                      <span className={`badge ${planilla.pagado ? 'ok' : 'warn'}`}>{planilla.pagado ? '💰 Pagado' : '⏳ No pagado'}</span>
                    </td>
                    <td rowSpan={planilla.lineas.length}>
                      <button className="btn xs ghost" onClick={() => setComps(planilla)}>📎 {planilla.comprobantes.length || '—'}</button>
                      {isAdmin && <ComprobanteButton planilla={planilla} onDone={load} onError={setError} />}
                    </td>
                  </>}
                  <td>{formatDate(planilla.fechaEmision)}</td>
                  <td>{formatDate(planilla.fechaRegistro)}</td>
                  <LineaCells key={linea.id} editing={editing} planilla={planilla} linea={linea} onSaved={load} onError={setError} />
                  {index === 0 && <td rowSpan={planilla.lineas.length} className="num" style={{ fontWeight: 700 }}>{soles(planilla.total)}</td>}
                  {index === 0 && isAdmin && <td rowSpan={planilla.lineas.length}>{planilla.userNombre}</td>}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        {!planillas.length && <div className="card-b"><p className="hint">No hay registros para los filtros seleccionados.</p></div>}
      </div>

      {/* Comprobantes modal */}
      {comps && (
        <div className="modal-backdrop" onClick={() => setComps(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>📎 Comprobantes · {comps.clave}</h3>
            {comps.comprobantes.length === 0 && <p className="hint">No hay comprobantes adjuntos.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
              {comps.comprobantes.map((comp) => (
                <li key={comp.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <a href={`/api/comprobantes/${comp.id}/archivo`}>📄 {comp.originalName}</a>
                  <span className="hint" style={{ marginLeft: 8 }}>{comp.uploadedByName} · {formatDate(comp.uploadedAt)}</span>
                </li>
              ))}
            </ul>
            <button className="btn" onClick={() => setComps(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LineaCells({ editing, planilla, linea, onSaved, onError }: {
  editing: boolean;
  planilla: Planilla;
  linea: Planilla['lineas'][number];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [destino, setDestino] = useState(linea.destino);
  const [motivo, setMotivo] = useState(linea.motivo);
  const [proyecto, setProyecto] = useState(linea.proyecto);
  const [monto, setMonto] = useState(String(linea.monto));
  const [fecha, setFecha] = useState(planilla.fechaEmision);
  if (!editing) {
    return (
      <>
        <td>{linea.proyecto}</td>
        <td>{linea.destino}</td>
        <td>{linea.motivo}</td>
        <td>{linea.pc}</td>
        <td className="num">{soles(linea.monto)}</td>
      </>
    );
  }
  return (
    <>
      <td><input value={proyecto} onChange={(e) => setProyecto(e.target.value)} /></td>
      <td><input value={destino} onChange={(e) => setDestino(e.target.value)} /></td>
      <td><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></td>
      <td>{linea.pc}</td>
      <td>
        <input value={monto} onChange={(e) => setMonto(e.target.value)} />
        {linea.orden === 1 && <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
        <button className="btn xs primary" style={{ marginTop: 4 }} onClick={async () => {
          try {
            await api(`/api/planillas/${planilla.id}/lineas/${linea.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                destino, motivo, proyecto, monto: Number(monto),
                ...(linea.orden === 1 ? { fechaEmision: fecha } : {}),
              }),
            });
            await onSaved();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'No se pudo guardar la línea.');
          }
        }}>💾</button>
        <button className="btn xs danger" style={{ marginTop: 4 }} onClick={async () => {
          if (!confirm('¿Eliminar esta línea?')) return;
          try {
            await api(`/api/planillas/${planilla.id}/lineas/${linea.id}`, { method: 'DELETE' });
            await onSaved();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'No se pudo eliminar.');
          }
        }}>🗑️</button>
      </td>
    </>
  );
}

function ComprobanteButton({ planilla, onDone, onError }: { planilla: Planilla; onDone: () => Promise<void>; onError: (message: string) => void }) {
  return (
    <input type="file" multiple disabled={!planilla.pagado} title={planilla.pagado ? 'Adjuntar comprobantes' : 'Marca como pagada para adjuntar'} style={{ width: 100, fontSize: 11, marginTop: 4 }} onChange={async (event) => {
      const files = event.target.files;
      if (!files?.length) return;
      const form = new FormData();
      Array.from(files).forEach((file) => form.append('files', file));
      try {
        await api(`/api/planillas/${planilla.id}/comprobantes`, { method: 'POST', body: form });
        await onDone();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'No se pudieron subir los comprobantes.');
      } finally {
        event.target.value = '';
      }
    }} />
  );
}
