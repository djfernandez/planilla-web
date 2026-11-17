'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { fetchDataUrl, generateConsentPdf } from '@/lib/pdf';

export default function ConsentPage() {
  return (
    <Shell>
      <ConsentForm />
    </Shell>
  );
}

function ConsentForm() {
  const { me, refresh } = useAuth();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [accepted, setAccepted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    };
    const down = (event: PointerEvent) => {
      drawing.current = true;
      const p = point(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (event: PointerEvent) => {
      if (!drawing.current) return;
      const p = point(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      setDirty(true);
    };
    const up = () => { drawing.current = false; };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
  }

  async function save() {
    if (!me || !canvasRef.current || !dirty || !accepted) return;
    setPending(true);
    setError('');
    try {
      const rubrica = canvasRef.current.toDataURL('image/png');
      const logo = me.empresa?.hasLogo ? await fetchDataUrl(`/api/empresas/${me.empresa.id}/logo`) : '';
      const pdf = await generateConsentPdf({
        nombres: me.nombres,
        apellidos: me.apellidos,
        dni: me.dni,
        email: me.email,
        rubrica,
        empresa: me.empresa ? { ...me.empresa, logo } : null,
      });
      const firmaBlob = await new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, 'image/png'));
      if (!firmaBlob) throw new Error('No se pudo leer la rúbrica.');
      const form = new FormData();
      form.append('firma', firmaBlob, 'rubrica.png');
      form.append('consentimiento', pdf, 'consentimiento.pdf');
      await api('/api/usuarios/consentimiento', { method: 'POST', body: form });
      await refresh();
      router.replace('/planilla');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el consentimiento.');
    } finally {
      setPending(false);
    }
  }

  if (!me) return null;
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 8 }}>✍️ Consentimiento de uso y rúbrica digital</h2>
      <p style={{ marginBottom: 12 }}>Yo, <b>{me.nombres} {me.apellidos}</b>, titular del correo <b>{me.email}</b>, declaro lo siguiente:</p>
      <ol style={{ marginLeft: 20, marginBottom: 16, lineHeight: 1.8 }}>
        <li>Acepto la responsabilidad total por el uso de este sistema y la veracidad de la información que registre.</li>
        <li>Confirmo que el correo asociado a esta cuenta es de mi propiedad.</li>
        <li>Acepto que la rúbrica registrada se usará como mi firma en los PDF generados por el sistema.</li>
      </ol>
      <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>Registra tu rúbrica</label>
      <canvas ref={canvasRef} className="canvas" width={640} height={180} />
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={clearCanvas}>Limpiar</button>
        <label style={{ textTransform: 'none', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ width: 'auto' }} />
          He leído y acepto los términos.
        </label>
        <button className="btn primary" disabled={!accepted || !dirty || pending} onClick={save}>
          {pending ? <><span className="spinner" /> Guardando…</> : 'Aceptar y guardar rúbrica'}
        </button>
      </div>
      {error && <p className="alert danger" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
