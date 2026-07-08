'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type HiggsAuthState = 'idle' | 'starting' | 'waiting' | 'approved' | 'error'

type Props = {
  /** Called whenever the live connection status changes (initial check, poll result, reconnect). */
  onStatusChange?: (connected: boolean) => void
  /** Extra content rendered at the bottom of the card (e.g. a collapsible tutorial on the Dashboard). */
  children?: React.ReactNode
}

export function HiggsfieldConnect({ onStatusChange, children }: Props) {
  const [higgsConnected, setHiggsConnected] = useState(false)
  const [higgsAuthState, setHiggsAuthState] = useState<HiggsAuthState>('idle')
  const [higgsDeviceUrl, setHiggsDeviceUrl] = useState('')
  const [higgsError, setHiggsError] = useState('')
  const higgsPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Override DB boolean with actual CLI-validated status
  useEffect(() => {
    fetch('/api/higgsfield-auth/status')
      .then(r => r.json())
      .then(data => {
        setHiggsConnected(data.valid)
        onStatusChange?.(!!data.valid)
        if (data.refreshed) {
          console.log('Higgsfield token auto-refreshed')
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling après device code flow
  const pollHiggsfield = useCallback(() => {
    if (higgsPollRef.current) clearInterval(higgsPollRef.current)
    higgsPollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/higgsfield-auth/poll')
        const data = await res.json()
        if (data.status === 'approved') {
          if (higgsPollRef.current) clearInterval(higgsPollRef.current)
          setHiggsAuthState('approved')
          setHiggsConnected(true)
          onStatusChange?.(true)
          if (data.refreshTokenSaved === false) {
            console.warn('Higgsfield connected without a refresh token — session may expire sooner than usual.')
          }
        } else if (data.status === 'no_pending') {
          if (higgsPollRef.current) clearInterval(higgsPollRef.current)
          setHiggsAuthState('error')
          setHiggsError('Session expired before approval — click Reconnect to try again.')
        } else if (data.status === 'error') {
          if (higgsPollRef.current) clearInterval(higgsPollRef.current)
          setHiggsAuthState('error')
          setHiggsError(data.message || 'Higgsfield connection failed — click Reconnect to try again.')
        }
      } catch {
        // ignore transient poll errors, keep retrying until no_pending/approved
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 2000)
  }, [onStatusChange])

  // Nettoyage du polling au démontage
  useEffect(() => {
    return () => { if (higgsPollRef.current) clearInterval(higgsPollRef.current) }
  }, [])

  const startHiggsAuth = async () => {
    setHiggsAuthState('starting')
    setHiggsDeviceUrl('')
    setHiggsError('')
    try {
      const res = await fetch('/api/higgsfield-auth/start', { method: 'POST' })
      const data = await res.json()
      if (data.deviceUrl) {
        setHiggsDeviceUrl(data.deviceUrl)
        setHiggsAuthState('waiting')
        pollHiggsfield()
      } else {
        setHiggsAuthState('error')
        setHiggsError(data.error || 'Unknown error starting Higgsfield connection.')
      }
    } catch (e) {
      setHiggsAuthState('error')
      setHiggsError(String(e))
    }
  }

  return (
    <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
      <h2 className="font-medium mb-3 text-gray-900">Higgsfield</h2>

      {higgsAuthState === 'waiting' ? (
        <div className="space-y-3">
          <p className="text-sm text-amber-600">⏳ Waiting for approval...</p>
          <a
            href={higgsDeviceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition"
          >
            🔗 Authorize on Higgsfield
          </a>
          <p className="text-gray-800 text-xs break-all">{higgsDeviceUrl}</p>
        </div>
      ) : higgsAuthState === 'approved' ? (
        <div className="text-green-400 text-sm">✅ Higgsfield connected!</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            {higgsConnected ? (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <span>✅</span>
                <span>Connected</span>
              </div>
            ) : (
              <p className="text-gray-700 text-sm">
                Connect your Higgsfield account in one click — no token copying needed.
              </p>
            )}
            <button
              onClick={startHiggsAuth}
              disabled={higgsAuthState === 'starting'}
              className={higgsConnected
                ? 'text-xs bg-gradient-to-br from-violet-600 to-violet-700 text-white px-3 py-1.5 rounded-lg shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap'
                : 'bg-white hover:bg-white/60 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 text-gray-900 text-sm rounded-lg px-4 py-2 transition shadow-sm whitespace-nowrap'
              }
            >
              {higgsAuthState === 'starting'
                ? '⏳ Starting...'
                : higgsConnected ? 'Reconnect' : '🔗 Connect Higgsfield'}
            </button>
          </div>
          {higgsAuthState === 'error' && (
            <p className="text-red-600 text-xs">{higgsError || 'Connection error. Try again.'}</p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
