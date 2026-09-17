'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AuthForm from '@/components/auth-form'
import { getToken } from '@/lib/api-client'

export default function SignInPage() {
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
            <span className="eyebrow-line" /> ACCESO SEGURO
          </span>
          <h1>Bienvenido de nuevo</h1>
          <p>Ingresá para continuar con la operación de tu guardia.</p>
        </div>
        <AuthForm mode="sign-in" />
        <p className="auth-switch">
          ¿Todavía no tenés una cuenta? <Link href="/sign-up">Crear cuenta</Link>
        </p>
      </section>
    </main>
  )
}
