'use client'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GROUPS = [
  {
    key: 'image', label: '📸 IMAGE', href: '/',
    pages: ['/', '/studio', '/bulk-edit', '/image'],
    subTabs: [
      { label: 'Scraping', href: '/' },
      { label: 'Prompt Studio', href: '/studio' },
      { label: 'Bulk Edit', href: '/bulk-edit' },
    ]
  },
  {
    key: 'video', label: '🎬 VIDEO', href: '/video',
    pages: ['/video', '/prompt-lab', '/motion-control'],
    subTabs: [
      { label: 'Videos', href: '/video' },
      { label: 'Prompt Lab', href: '/prompt-lab' },
      { label: 'Motion Control', href: '/motion-control' },
    ]
  },
  { key: 'carousel', label: '🃏 CARROUSEL', href: '/carousel', pages: ['/carousel'], subTabs: [] },
  { key: 'metadata', label: '🧹 METADATA', href: '/metadata', pages: ['/metadata'], subTabs: [] },
  { key: 'en-cours', label: '⏳ EN COURS', href: '/en-cours', pages: ['/en-cours'], subTabs: [] },
]

export function NavBar() {
  const pathname = usePathname()
  const activeGroup = GROUPS.find(g => g.pages.includes(pathname)) ?? GROUPS[0]

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-white/70 shadow-[0_2px_16px_rgba(109,40,217,0.10),0_1px_0_rgba(255,255,255,0.6)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-[6px] bg-white flex items-center justify-center overflow-hidden shrink-0"
            style={{ boxShadow: '0 0 10px rgba(91,33,245,0.4)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/LOGO.png" alt="Modelify" width={18} height={18} style={{ objectFit: 'contain' }} />
          </div>
          <span className="font-bold text-gray-900 tracking-wide">Modelify</span>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/kpi" className="text-gray-700 hover:text-gray-900 transition-colors duration-150">KPI</Link>
          <Link href="/settings" className="text-gray-700 hover:text-gray-900 transition-colors duration-150">Settings</Link>
        </div>
      </div>

      {/* Group tabs */}
      <div className="flex px-3 border-t border-white/60">
        {GROUPS.map(group => {
          const isActive = group.key === activeGroup.key
          return (
            <Link
              key={group.key}
              href={group.href}
              className="relative px-4 py-2.5 text-sm font-medium transition-colors duration-150"
            >
              <span className={isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}>
                {group.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="group-indicator"
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-violet-500 rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          )
        })}
      </div>

      {/* Sub-tabs */}
      <AnimatePresence mode="wait">
        {activeGroup.subTabs.length > 1 && (
          <motion.div
            key={activeGroup.key}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="flex px-4 bg-white/40 backdrop-blur-sm border-t border-white/60 overflow-hidden"
          >
            {activeGroup.subTabs.map(tab => {
              const isActive = pathname === tab.href
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-all duration-150 whitespace-nowrap ${
                    isActive
                      ? 'text-gray-900 border-violet-500'
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
