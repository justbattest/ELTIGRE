'use client'

import { useState, useEffect } from 'react'

type DriveAuthState = 'idle' | 'starting' | 'waiting' | 'approved' | 'error'

type Props = {
  onConnectedChange?: (connected: boolean) => void
  /** Extra content rendered at the bottom of the card (e.g. a collapsible tutorial on the Dashboard). */
  children?: React.ReactNode
}

export function GoogleDriveConnect({ onConnectedChange, children }: Props) {
  const [driveFolderId, setDriveFolderId] = useState('')
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveAuthState, setDriveAuthState] = useState<DriveAuthState>('idle')
  const [driveError, setDriveError] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setDriveConnected(data.driveConnected || false)
        setDriveFolderId(data.driveFolderId || '')
        onConnectedChange?.(!!data.driveConnected)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveFolderId = async (value: string) => {
    setDriveFolderId(value)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFolderId: value }),
      })
    } catch {
      // best-effort — user can retry via Settings' full Save button
    }
  }

  const startDriveAuth = async () => {
    setDriveAuthState('starting')
    setDriveError('')
    try {
      const res = await fetch('/api/google-auth/start', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setDriveError(data.error)
        setDriveAuthState('error')
        return
      }

      const popup = window.open(
        data.authUrl,
        'google-drive-auth',
        'width=520,height=640,left=200,top=100'
      )

      if (!popup) {
        setDriveError('Popup blocked by the browser — allow popups for modelify.ai')
        setDriveAuthState('error')
        return
      }

      setDriveAuthState('waiting')

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'google-drive-connected') {
          window.removeEventListener('message', messageHandler)
          clearInterval(closedCheck)
          setDriveAuthState('approved')
          setDriveConnected(true)
          onConnectedChange?.(true)
        }
      }
      window.addEventListener('message', messageHandler)

      const closedCheck = setInterval(() => {
        if (popup.closed) {
          clearInterval(closedCheck)
          window.removeEventListener('message', messageHandler)
          setDriveAuthState(prev => prev === 'waiting' ? 'idle' : prev)
        }
      }, 1000)

    } catch {
      setDriveError('Unexpected network error')
      setDriveAuthState('error')
    }
  }

  const disconnectDrive = async () => {
    await fetch('/api/google-auth/poll', { method: 'DELETE' })
    setDriveConnected(false)
    setDriveAuthState('idle')
    onConnectedChange?.(false)
  }

  return (
    <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-gray-900">
          🗂️ Google Drive
          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${driveConnected ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-white/80 text-gray-800 border border-gray-200'}`}>
            {driveConnected ? '● Connected' : '○ Not connected'}
          </span>
        </h2>
      </div>
      <p className="text-gray-800 text-xs mb-4">
        Source images (Instagram) + generated images (Higgsfield) automatically uploaded to your Drive after each generation.
      </p>

      {/* Folder ID — toujours visible */}
      <div className="mb-4">
        <label className="block text-xs text-gray-800 mb-1">
          Target Drive folder{' '}
          <span className="text-gray-800">(ID from the URL: drive.google.com/drive/folders/<strong>ID</strong>)</span>
        </label>
        <input
          type="text"
          value={driveFolderId}
          onChange={(e) => saveFolderId(e.target.value)}
          placeholder="1ABC...XYZ"
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition text-sm"
        />
      </div>

      {/* Auth flow */}
      {driveConnected ? (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-green-600">✅</span>
            <span className="text-green-700 text-sm">Google account connected</span>
          </div>
          <button
            onClick={disconnectDrive}
            className="text-xs text-gray-800 hover:text-red-500 transition"
          >
            Disconnect
          </button>
        </div>
      ) : driveAuthState === 'waiting' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full flex-shrink-0" />
          <div>
            <p className="text-blue-700 text-sm font-medium">Google window open…</p>
            <p className="text-gray-800 text-xs mt-0.5">Sign in and accept the permissions in the popup.</p>
          </div>
        </div>
      ) : driveAuthState === 'approved' ? (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <span className="text-green-700 text-sm">✅ Drive connected successfully!</span>
        </div>
      ) : driveAuthState === 'error' ? (
        <div className="space-y-2">
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ❌ {driveError || 'Connection error'}
          </p>
          <button
            onClick={startDriveAuth}
            className="text-sm text-violet-600 hover:text-violet-700 transition"
          >
            ↺ Try again
          </button>
        </div>
      ) : (
        <button
          onClick={startDriveAuth}
          disabled={(driveAuthState as DriveAuthState) === 'starting'}
          className="w-full bg-white hover:bg-white/60 disabled:opacity-50 border border-gray-300 text-gray-900 text-sm rounded-lg px-4 py-2.5 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <span>🗂️</span>
          {driveAuthState === 'starting' ? '⏳ Connecting...' : 'Connect Google Drive'}
        </button>
      )}
      {children}
    </div>
  )
}
