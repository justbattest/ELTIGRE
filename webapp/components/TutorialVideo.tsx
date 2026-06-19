'use client'
import { useState } from 'react'

interface TutorialVideoProps {
  videoId: string
  title: string
}

export function TutorialVideo({ videoId, title }: TutorialVideoProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-6 rounded-xl border border-violet-200/60 bg-white/70 backdrop-blur-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-violet-700 hover:bg-violet-50/60 transition"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">📺</span>
          Watch tutorial — {title}
        </span>
        <span className="text-violet-400 text-xs">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="relative w-full rounded-lg overflow-hidden shadow-sm" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  )
}
