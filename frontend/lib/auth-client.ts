'use client'

import { useEffect, useState } from 'react'
import { api, ApiError, ApiUser, clearSession, getStoredUser, getToken, setSession } from '@/lib/api-client'

export type Session = { user: ApiUser } | null

export function useSession() {
  const [data, setData] = useState<Session>(null)
  const [isPending, setIsPending] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const token = getToken()
      const stored = getStoredUser()
      if (!token) {
        if (!cancelled) {
          setData(null)
          setIsPending(false)
        }
        return
      }

      if (stored && !cancelled) setData({ user: stored })

      try {
        const user = await api.me()
        if (!cancelled) {
          setSession(token, user)
          setData({ user })
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) clearSession()
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setIsPending(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { data, isPending }
}

export async function signIn(email: string, password: string) {
  const result = await api.login(email, password)
  setSession(result.access_token, result.user)
  return result
}

export async function signUp(input: { name: string; email: string; password: string }) {
  const result = await api.register(input)
  setSession(result.access_token, result.user)
  return result
}

export function signOut() {
  clearSession()
  window.location.assign('/sign-in')
}
