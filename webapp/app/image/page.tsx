'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { TutorialVideo } from '@/components/TutorialVideo'

export default function ImagePage() {
  useSession()

  const [higgsOk, setHiggsOk] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/higgsfield-auth/status')
      .then(r => r.json())
      .then(d => setHiggsOk(d.valid))
      .catch(() => setHiggsOk(false))
  }, [])

  return (
    <div className="min-h-screen text-gray-900">
      <div className="border-b border-white/70 px-6 py-3 flex items-center justify-between sticky top-0 bg-white/85 backdrop-blur-xl z-20 shadow-[0_1px_12px_rgba(109,40,217,0.08)]">
        <span className="text-violet-600 font-bold text-lg">🐯 LOS TIGRES FACTORY</span>
        <div className="flex items-center gap-3 text-sm">
          {higgsOk !== null && (
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${higgsOk ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-gray-600 font-medium">
                {higgsOk ? 'HF Connected' : 'HF Disconnected'}
              </span>
              {!higgsOk && (
                <Link href="/settings" className="text-xs px-2 py-0.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition font-medium">
                  Reconnect
                </Link>
              )}
            </div>
          )}
          <Link href="/kpi" className="text-gray-700 hover:text-gray-900 transition">📊 KPI</Link>
          <Link href="/settings" className="text-gray-700 hover:text-gray-900 transition">⚙️ Settings</Link>
        </div>
      </div>
      <div className="border-b border-gray-200 px-6">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          <div className="px-5 py-3 text-sm font-medium text-violet-700 border-b-2 border-violet-600 whitespace-nowrap">📸 Image</div>
          <Link href="/carousel" className="px-5 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition whitespace-nowrap">🃏 Carousels</Link>
          <Link href="/video" className="px-5 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition whitespace-nowrap">🎬 Videos</Link>
          <Link href="/motion-control" className="px-5 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition whitespace-nowrap">🎭 Motion Control</Link>
          <Link href="/bulk-edit" className="px-5 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition whitespace-nowrap">🖼 Bulk Edit</Link>
          <Link href="/metadata" className="px-5 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition whitespace-nowrap">🧹 Metadata Opti</Link>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition whitespace-nowrap">⏳ In progress</Link>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <h1 className="text-2xl font-bold">📸 Image</h1>
        <TutorialVideo videoId="CiWJUfTDwtY" title="Scraping" />
        <p className="text-gray-700">Instagram scraping + Higgsfield image generation.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Scraping — temporairement désactivé (maintenance) */}
          <div className="bg-white/75 backdrop-blur-xl rounded-2xl border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] p-6 opacity-40 cursor-not-allowed select-none">
            <div className="text-3xl mb-3">🔄</div>
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="font-semibold text-gray-900">Scraping</h2>
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-normal">🚧 Maintenance</span>
            </div>
            <p className="text-gray-800 text-sm mt-1">Scrape Instagram profiles, analyze posts and generate images.</p>
          </div>
          <Link href="/studio" className="bg-white/75 backdrop-blur-xl rounded-2xl border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] p-6 hover:border-violet-400 transition group">
            <div className="text-3xl mb-3">✨</div>
            <h2 className="font-semibold text-gray-900 group-hover:text-violet-700 transition">Prompt Studio</h2>
            <p className="text-gray-800 text-sm mt-1">Generate images with custom prompts and advanced settings.</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
