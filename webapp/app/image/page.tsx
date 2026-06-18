'use client'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { TutorialVideo } from '@/components/TutorialVideo'

export default function ImagePage() {
  useSession()
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 bg-white z-20">
        <span className="text-violet-600 font-bold text-lg">🐯 LOS TIGRES FACTORY</span>
        <div className="flex gap-3 text-sm">
          <Link href="/kpi" className="text-slate-500 hover:text-slate-900 transition">📊 KPI</Link>
          <Link href="/settings" className="text-slate-500 hover:text-slate-900 transition">⚙️ Settings</Link>
        </div>
      </div>
      <div className="border-b border-slate-200 px-6">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          <div className="px-5 py-3 text-sm font-medium text-violet-700 border-b-2 border-violet-600 whitespace-nowrap">📸 Image</div>
          <Link href="/carousel" className="px-5 py-3 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition whitespace-nowrap">🃏 Carousels</Link>
          <Link href="/video" className="px-5 py-3 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition whitespace-nowrap">🎬 Videos</Link>
          <Link href="/motion-control" className="px-5 py-3 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition whitespace-nowrap">🎭 Motion Control</Link>
          <Link href="/bulk-edit" className="px-5 py-3 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition whitespace-nowrap">🖼 Bulk Edit</Link>
          <Link href="/metadata" className="px-5 py-3 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition whitespace-nowrap">🧹 Metadata Opti</Link>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition whitespace-nowrap">⏳ In progress</Link>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <h1 className="text-2xl font-bold">📸 Image</h1>
        <TutorialVideo videoId="kA53iyKKKgM" title="Images" />
        <p className="text-slate-500">Instagram scraping + Higgsfield image generation.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Scraping — temporairement désactivé (maintenance) */}
          <div className="bg-white border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-6 opacity-40 cursor-not-allowed select-none">
            <div className="text-3xl mb-3">🔄</div>
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="font-semibold text-slate-900">Scraping</h2>
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-normal">🚧 Maintenance</span>
            </div>
            <p className="text-slate-600 text-sm mt-1">Scrape Instagram profiles, analyze posts and generate images.</p>
          </div>
          <Link href="/studio" className="bg-white border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-6 hover:border-violet-500 transition group">
            <div className="text-3xl mb-3">✨</div>
            <h2 className="font-semibold text-slate-900 group-hover:text-violet-700 transition">Prompt Studio</h2>
            <p className="text-slate-600 text-sm mt-1">Generate images with custom prompts and advanced settings.</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
