'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';

export default function HomePage() {
  const { me, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (!me.activo) router.replace('/login');
    else if (!me.hasRubrica) router.replace('/consentimiento');
    else router.replace('/planilla');
  }, [loading, me, router]);
  return (
    <div className="loading-screen">
      <div className="spinner spinner-lg" />
      <p>Cargando…</p>
    </div>
  );
}
