'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';

export function Shell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { me, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (!me.activo) return;
    else if (!me.hasRubrica && pathname !== '/consentimiento') router.replace('/consentimiento');
    else if (admin && me.rol !== 'ADMIN') router.replace('/planilla');
  }, [admin, loading, me, pathname, router]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <p>Cargando…</p>
      </div>
    );
  }
  if (!me) return null;
  if (!me.activo) {
    return (
      <div className="modal-wrap">
        <div className="modal-card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Cuenta desactivada</h2>
          <p style={{ marginBottom: 20 }}>Tu cuenta está desactivada. Contacta a un administrador para que la reactive.</p>
          <button className="btn primary" onClick={() => logout().then(() => router.replace('/login'))}>Cerrar sesión</button>
        </div>
      </div>
    );
  }

  const initials = ((me.nombres?.charAt(0) || '') + (me.apellidos?.charAt(0) || '')).toUpperCase() || '??';

  const pageTitles: Record<string, string> = {
    '/planilla': 'Nueva Planilla',
    '/historial': 'Historial',
    '/ajustes': 'Ajustes',
    '/consentimiento': 'Consentimiento',
  };

  const navItems = [
    { href: '/planilla', label: 'Nueva Planilla', icon: '📄' },
    { href: '/historial', label: 'Historial', icon: '📊' },
    ...(me.rol === 'ADMIN' ? [{ href: '/ajustes', label: 'Ajustes', icon: '⚙️' }] : []),
  ];

  // Consent page — no sidebar, just centered card
  if (pathname === '/consentimiento') {
    return (
      <div className="modal-wrap">
        <div className="modal-card" style={{ maxWidth: 640 }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-brand-icon">📋</div>
          <div>
            <div className="sb-brand-name">Planilla de Movilidad</div>
            <div className="sb-brand-sub">Sistema de rendición</div>
          </div>
        </div>

        <nav className="sb-nav">
          <div className="sb-section-label">Menú</div>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sb-item ${pathname === item.href ? 'active' : ''}`}
            >
              <span className="sb-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sb-footer">
          <div className="sb-user">
            <div className="sb-avatar">{initials}</div>
            <div className="sb-user-info">
              <div className="sb-user-name">{me.nombres} {me.apellidos}</div>
              <div className="sb-user-role">{me.rol}</div>
            </div>
          </div>
          <button className="sb-logout" onClick={() => logout().then(() => router.replace('/login'))}>
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-title">{pageTitles[pathname] || 'Planilla de Movilidad'}</div>
          <div className="topbar-right">
            <span className="hint">Conectado como <strong>{me.nombres}</strong></span>
          </div>
        </header>
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  );
}
