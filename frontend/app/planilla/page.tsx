'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { soles, todayInput } from '@/lib/format';
import { fetchDataUrl, generatePlanillaPdf } from '@/lib/pdf';
import { TOPE, type Partida } from '@/lib/types';

type Draft = { destino: string; motivo: string; proyecto: string; pc: string; monto: string };

const empty = (proyecto: string, pc: string): Draft => ({ destino: '', motivo: '', proyecto, pc, monto: '' });

export default function PlanillaPage() {
  return (
    <Shell>
      <NuevaPlanilla />
    </Shell>
  );
}

function NuevaPlanilla() {
  const { me } = useAuth();
  const router = useRouter();
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [numero, setNumero] = useState('…');
  const [fecha, setFecha] = useState(todayInput());
  const [proyecto, setProyecto] = useState('');
  const [rows, setRows] = useState<Draft[]>([]);
  const [gastado, setGastado] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!me?.hasRubrica) return;
    setProyecto(me.proyDef || me.proyectos[0] || '');
    api<{ partidas: Partida[] }>('/api/movilidades').then((data) => {
      setPartidas(data.partidas);
      setRows([empty(me.proyDef || me.proyectos[0] || '', data.partidas[0]?.codigo || '')]);
    }).catch((err: Error) => setError(err.message));
    api<{ serie: string; numero: string }>('/api/planillas/siguiente')
      .then((data) => setNumero(`${data.serie}-${data.numero}`))
      .catch((err: Error) => setError(err.message));
  }, [me]);

  useEffect(() => {
    if (!fecha) return;
    api<{ gastado: number }>(`/api/planillas/acumulado?fecha=${fecha}`)
      .then((data) => setGastado(data.gastado))
      .catch(() => setGastado(0));
  }, [fecha]);

  const total = rows.reduce((sum, row) => sum + (Number(row.monto) || 0), 0);
  const excede = gastado + total > TOPE;
  const disponible = Math.max(0, TOPE - gastado);
  const usable = rows.filter((row) => Number(row.monto) > 0 && row.destino.trim() && row.motivo.trim() && row.pc);

  function update(index: number, patch: Partial<Draft>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function guardar() {
    if (!me || usable.length === 0 || excede) return;
    setPending(true);
    setError('');
    try {
      const siguiente = await api<{ serie: string; numero: string }>('/api/planillas/siguiente');
      const logo = me.empresa?.hasLogo ? await fetchDataUrl(`/api/empresas/${me.empresa.id}/logo`) : '';
      const rubrica = await fetchDataUrl(`/api/usuarios/${me.id}/firma`);
      const lineas = usable.map((row) => ({
        destino: row.destino.toUpperCase(),
        motivo: row.motivo.toUpperCase(),
        proyecto: row.proyecto.toUpperCase(),
        pc: row.pc,
        monto: Number(row.monto),
      }));
      const pdf = await generatePlanillaPdf({
        serie: siguiente.serie,
        numero: siguiente.numero,
        fecha,
        nombres: me.nombres,
        apellidos: me.apellidos,
        dni: me.dni,
        empresa: me.empresa ? { ...me.empresa, logo } : null,
        rubrica,
        lineas,
      });
      const form = new FormData();
      form.append('payload', JSON.stringify({ fechaEmision: fecha, lineas }));
      form.append('pdf', pdf, `${siguiente.serie}-${siguiente.numero}.pdf`);
      await api('/api/planillas', { method: 'POST', body: form });
      router.push('/historial');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la planilla.');
    } finally {
      setPending(false);
    }
  }

  if (!me) return null;
  return (
    <div>
      {/* Page header banner */}
      <div className="page-header">
        <div className="page-header-left">
          <h2>PLANILLA DE MOVILIDAD</h2>
          <div className="sub">{me.empresa ? `${me.empresa.razon} · RUC ${me.empresa.ruc}` : 'Sin empresa asignada'}</div>
        </div>
        <div className="page-header-badge">{numero}</div>
      </div>

      {/* Worker info + controls */}
      <div className="card">
        <div className="card-b">
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="group">
              <label>Trabajador</label>
              <div style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{me.nombres} {me.apellidos}</div>
            </div>
            <div className="group">
              <label>DNI</label>
              <div>{me.dni}</div>
            </div>
            <div className="group">
              <label>Fecha de emisión</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="group">
              <label>Proyecto</label>
              <select value={proyecto} onChange={(e) => {
                setProyecto(e.target.value);
                setRows((current) => current.map((row) => ({ ...row, proyecto: e.target.value })));
              }}>
                <option value="">(sin proyecto)</option>
                {me.proyectos.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>

          {/* Totals pills */}
          <div className="row" style={{ gap: 12 }}>
            <span className="total-pill">📅 Acumulado: {soles(gastado)}</span>
            <span className={`total-pill ${disponible <= 0 ? 'danger' : 'ok'}`}>💰 Disponible: {soles(disponible)}</span>
            <span className={`total-pill ${excede ? 'danger' : total > 0 ? 'ok' : ''}`}>📊 Total: {soles(total)}</span>
          </div>
        </div>
      </div>

      {excede && (
        <div className="alert danger" style={{ marginBottom: 12 }}>
          ⚠️ Con este monto superas el tope de {soles(TOPE)} para este día.
        </div>
      )}

      {/* Row table */}
      <div className="card">
        <div className="card-h">
          <span>Detalle de gastos</span>
          <button className="btn small" type="button" onClick={() => setRows((current) => [...current, empty(proyecto, partidas[0]?.codigo || '')])}>
            + Agregar fila
          </button>
        </div>
        <div className="card-b">
          {rows.map((row, index) => (
            <div className="line" key={index}>
              <span className="line-num">{index + 1}</span>
              <input placeholder="DESTINO" value={row.destino} onChange={(e) => update(index, { destino: e.target.value })} />
              <input placeholder="MOTIVO" value={row.motivo} onChange={(e) => update(index, { motivo: e.target.value })} />
              <input value={row.proyecto} readOnly style={{ color: 'var(--text-muted)' }} />
              <select value={row.pc} onChange={(e) => update(index, { pc: e.target.value })}>
                {partidas.map((pc) => <option key={pc.codigo} value={pc.codigo}>{pc.codigo}{pc.descripcion ? ` - ${pc.descripcion}` : ''}</option>)}
              </select>
              <input inputMode="decimal" placeholder="0.00" value={row.monto} onChange={(e) => update(index, { monto: e.target.value.replace(/[^0-9.]/g, '') })} style={{ textAlign: 'right' }} />
              <button className="btn small danger" type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <p className="hint">Base legal: inciso a1) del artículo 37° del TUO de la Ley del Impuesto a la Renta.</p>
        <button className="btn primary" disabled={pending || excede || usable.length === 0} onClick={guardar}>
          {pending ? <><span className="spinner" /> Guardando…</> : '💾 Finalizar y guardar PDF'}
        </button>
      </div>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
