'use client'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function ImagePage() {
  useSession()
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 bg-gray-950 z-20">
        <span className="text-violet-400 font-bold text-lg">🐯 LOS TIGRES FACTORY</span>
        <div className="flex gap-3 text-sm">
          <Link href="/kpi" className="text-gray-400 hover:text-white transition">📊 KPI</Link>
          <Link href="/settings" className="text-gray-400 hover:text-white transition">⚙️ Settings</Link>
        </div>
      </div>
      <div className="border-b border-gray-800 px-6">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500 whitespace-nowrap">📸 Image</div>
          <Link href="/carousel" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🃏 Carousels</Link>
          <Link href="/video" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🎬 Videos</Link>
          <Link href="/motion-control" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🎭 Motion Control</Link>
          <Link href="/bulk-edit" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🖼 Bulk Edit</Link>
          <Link href="/metadata" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🧹 Metadata Opti</Link>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">⏳ In progress</Link>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <h1 className="text-2xl font-bold">📸 Image</h1>
        <p className="text-gray-400">Instagram scraping + Higgsfield image generation.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/" className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-violet-500 transition group">
            <div className="text-3xl mb-3">🔄</div>
            <h2 className="font-semibold text-white group-hover:text-violet-300 transition">Scraping</h2>
            <p className="text-gray-500 text-sm mt-1">Scrape Instagram profiles, analyze posts and generate images.</p>
          </Link>
          <Link href="/studio" className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-violet-500 transition group">
            <div className="text-3xl mb-3">✨</div>
            <h2 className="font-semibold text-white group-hover:text-violet-300 transition">Prompt Studio</h2>
            <p className="text-gray-500 text-sm mt-1">Generate images with custom prompts and advanced settings.</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
