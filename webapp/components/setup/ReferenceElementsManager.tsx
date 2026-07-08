'use client'

import { useState, useEffect } from 'react'

type RefElement = { id: string; name: string; type?: string }

type Props = {
  /** Enables/disables the "Scan from Higgsfield" button. */
  higgsConnected: boolean
  /** Called after the initial load and after every mutation, so a parent page can mirror the list (e.g. Character Prompt Rules). */
  onChange?: (elements: RefElement[]) => void
  /** Extra content rendered at the bottom of the card (e.g. a collapsible tutorial on the Dashboard). */
  children?: React.ReactNode
}

export function ReferenceElementsManager({ higgsConnected, onChange, children }: Props) {
  const [referenceElements, setReferenceElements] = useState<RefElement[]>([])
  const [newElementId, setNewElementId] = useState('')
  const [newElementName, setNewElementName] = useState('')
  const [newElementType, setNewElementType] = useState<'soul_2' | 'soul_cinematic'>('soul_2')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const elements: RefElement[] = data.referenceElements || []
        setReferenceElements(elements)
        onChange?.(elements)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = async (next: RefElement[]) => {
    setReferenceElements(next)
    onChange?.(next)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceElements: next }),
      })
    } catch {
      // best-effort — user can retry via Settings' full Save button
    }
  }

  const addElement = () => {
    if (!newElementId.trim() || !newElementName.trim()) return
    persist([
      ...referenceElements,
      { id: newElementId.trim(), name: newElementName.trim(), type: newElementType },
    ])
    setNewElementId('')
    setNewElementName('')
  }

  const removeElement = (id: string) => {
    persist(referenceElements.filter((e) => e.id !== id))
  }

  const scanElements = async () => {
    setScanning(true)
    setScanError('')
    try {
      const res = await fetch('/api/characters/scan-elements')
      const data = await res.json()
      if (!res.ok || data.error) {
        setScanError(data.error || 'Scan error')
        return
      }
      const scanned: RefElement[] = (data.elements || []).map((e: { id: string; name: string }) => ({
        id: e.id,
        name: e.name,
      }))
      const existingIds = new Set(referenceElements.map(e => e.id))
      const newOnes = scanned.filter(e => !existingIds.has(e.id))
      if (newOnes.length > 0) {
        persist([...referenceElements, ...newOnes])
      }
      if (newOnes.length === 0 && scanned.length > 0) {
        setScanError(`${scanned.length} character(s) found — all already added.`)
      }
    } catch (e) {
      setScanError(String(e))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-medium text-gray-900">Reference Elements</h2>
        <button
          onClick={scanElements}
          disabled={scanning || !higgsConnected}
          title={!higgsConnected ? 'Connect Higgsfield first' : 'Auto-scan characters from Higgsfield'}
          className="text-xs bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition font-medium"
        >
          {scanning ? '⏳ Scanning...' : '🔍 Scan from Higgsfield'}
        </button>
      </div>
      <p className="text-gray-800 text-xs mb-1">
        🖼 <strong className="text-gray-800">Images (Nano Banana)</strong> — auto-detected via the Scan button.<br/>
        🎬 <strong className="text-gray-800">Videos (Seedance)</strong> — add manually: open <strong className="text-gray-800">app.higgsfield.ai → Elements → Characters</strong>, open DevTools (F12) → Network, click your character → copy the UUID from the request URL <code className="text-violet-600">/reference-elements/UUID-HERE</code>.
      </p>
      {scanError && (
        <p className="text-xs text-amber-600 mb-2">{scanError}</p>
      )}

      {/* Liste existante */}
      {referenceElements.length > 0 && (
        <div className="space-y-2 mb-3">
          {referenceElements.map((el) => (
            <div
              key={el.id}
              className="flex items-center justify-between bg-white/80 border border-gray-200 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-900 text-sm font-medium">{el.name}</span>
                {el.type === 'soul_2' && <span className="text-emerald-600 text-xs">🎬 Video</span>}
                {el.type === 'soul_cinematic' && <span className="text-gray-800 text-xs">🖼 Image</span>}
                <span className="text-gray-800 text-xs font-mono">{el.id.substring(0, 8)}…</span>
              </div>
              <button
                onClick={() => removeElement(el.id)}
                className="text-gray-800 hover:text-red-500 text-sm transition"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Ajouter un élément */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={newElementName}
          onChange={(e) => setNewElementName(e.target.value)}
          placeholder="Name (e.g. NINA HYBRID)"
          className="flex-1 min-w-[120px] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition text-sm"
        />
        <input
          type="text"
          value={newElementId}
          onChange={(e) => setNewElementId(e.target.value)}
          placeholder="UUID (ex: 0dbe364b-...)"
          className="flex-1 min-w-[180px] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition text-sm font-mono"
        />
        <select
          value={newElementType}
          onChange={(e) => setNewElementType(e.target.value as 'soul_2' | 'soul_cinematic')}
          className="bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-violet-500 transition"
        >
          <option value="soul_2">🎬 Video (Seedance)</option>
          <option value="soul_cinematic">🖼 Image (Nano Banana)</option>
        </select>
        <button
          onClick={addElement}
          className="bg-white/80 hover:bg-gray-200 text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 text-sm transition"
        >
          +
        </button>
      </div>
      {children}
    </div>
  )
}
