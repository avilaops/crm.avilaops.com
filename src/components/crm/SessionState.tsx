'use client'

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { getSession, type SessionUser } from '../../lib/auth'

type State = { user: SessionUser | null; setUser: Dispatch<SetStateAction<SessionUser | null>>; checking: boolean }
const SessionState = createContext<State | null>(null)

export function SessionStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    let active = true
    getSession().then((session) => { if (active) setUser(session.user) })
      .catch(() => undefined).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])
  return <SessionState.Provider value={{ user, setUser, checking }}>{children}</SessionState.Provider>
}

export function useSessionState() {
  const state = useContext(SessionState)
  if (!state) throw new Error('SessionStateProvider ausente')
  return state
}
