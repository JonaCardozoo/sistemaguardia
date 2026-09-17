'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/api-client'
import { signIn, signUp } from '@/lib/auth-client'

export default function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const isSignUp = mode === 'sign-up'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      if (isSignUp) await signUp({ name, email, password })
      else await signIn(email, password)
      router.push('/')
      router.refresh()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'No pudimos validar tus datos. Revisá el email y la contraseña.'
      setError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {isSignUp && (
        <label>
          <span>Nombre</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Tu nombre" />
        </label>
      )}
      <label>
        <span>Email</span>
        <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="operador@ejemplo.com" />
      </label>
      <label>
        <span>Contraseña</span>
        <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingresá tu contraseña" />
      </label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-button auth-submit" disabled={pending}>
        {pending ? 'VALIDANDO…' : isSignUp ? 'CREAR CUENTA' : 'INGRESAR'}
      </button>
    </form>
  )
}
