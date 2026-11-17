'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { me, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!me?.activo) return;
    router.replace(me.hasRubrica ? '/planilla' : '/consentimiento');
  }, [me, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      const me = await refresh();
      if (!me) {
        setError('No se pudo cargar el perfil.');
        return;
      }
      if (!me.activo) {
        setError('Tu cuenta está desactivada. Contacta a un administrador.');
        return;
      }
      router.replace(me.hasRubrica ? '/planilla' : '/consentimiento');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-layout">
      {/* LEFT — dark branding */}
      <div className="login-left">
        <div className="login-left-icon">📋</div>
        <h1>Planilla de<br />Movilidad</h1>
        <p>Sistema de rendición de gastos de movilidad para tu empresa</p>
        <div className="login-dots">
          <span className="login-dot active" />
          <span className="login-dot" />
          <span className="login-dot" />
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="login-right">
        <form className="login-form" onSubmit={onSubmit}>
          <h2>Bienvenido</h2>
          <p className="sub">Inicia sesión para continuar</p>

          <div className="login-field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@empresa.com"
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="pass">Contraseña</label>
            <input
              id="pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

          <p className="hint" style={{ marginBottom: 16 }}>Si olvidaste tu clave, un administrador puede asignarte una nueva.</p>

          <button className="btn primary" style={{ width: '100%', padding: '11px 16px', fontSize: 14 }} disabled={pending}>
            {pending ? <><span className="spinner" /> Ingresando…</> : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
