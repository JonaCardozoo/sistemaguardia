'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AuthForm from '@/components/auth-form'
import { getToken } from '@/lib/api-client'

export default function SignUpPage() {
  const router = useRouter()

  useEffect(() => {
    if (getToken()) router.replace('/')
  }, [router])

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">A</span>
          <div>
            <strong>LIBRO DE GUARDIA</strong>
            <span>Centro de monitoreo</span>
          </div>
        </div>
        <div className="auth-heading">
          <span className="eyebrow">
            <span className="eyebrow-line" /> NUEVO OPERADOR
          </span>
          <h1>Crear cuenta</h1>
          <p>Configurá tu acceso personal al centro de monitoreo.</p>
        </div>
        <AuthForm mode="sign-up" />
        <p className="auth-switch">
          ¿Ya tenés una cuenta? <Link href="/sign-in">Ingresar</Link>
        </p>
      </section>
    </main>
  )
}
