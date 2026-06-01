'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ImageIcon,
  VideoIcon,
  LayoutGrid,
  Wand2,
  Timer,
  Settings,
  BarChart2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const GROUPS = [
  {
    key: 'image',
    icon: ImageIcon,
    label: 'IMAGE',
    href: '/',
    pages: ['/', '/studio', '/bulk-edit', '/image'],
    subTabs: [
      { label: 'Scraping', href: '/' },
      { label: 'Prompt Studio', href: '/studio' },
      { label: 'Bulk Edit', href: '/bulk-edit' },
    ],
  },
  {
    key: 'video',
    icon: VideoIcon,
    label: 'VIDEO',
    href: '/video',
    pages: ['/video', '/prompt-lab', '/motion-control'],
    subTabs: [
      { label: 'Vidéos', href: '/video' },
      { label: 'Prompt Lab', href: '/prompt-lab' },
      { label: 'Motion Control', href: '/motion-control' },
    ],
  },
  { key: 'carousel', icon: LayoutGrid, label: 'CARROUSEL', href: '/carousel', pages: ['/carousel'], subTabs: [] },
  { key: 'metadata', icon: Wand2,      label: 'METADATA',  href: '/metadata', pages: ['/metadata'], subTabs: [] },
  { key: 'en-cours', icon: Timer,      label: 'EN COURS',  href: '/en-cours', pages: ['/en-cours'], subTabs: [] },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const activeGroup = GROUPS.find(g => g.pages.includes(pathname)) ?? GROUPS[0]

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="flex-shrink-0 flex flex-col h-screen sticky top-0 bg-black/50 backdrop-blur-xl border-r border-white/[0.05] z-40 overflow-hidden"
    >
      {/* ── Logo ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-[18px] border-b border-white/[0.05] shrink-0">
        {/* Tiger icon — minimal SVG */}
        <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0 text-violet-400" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 14.5v-3l-2 1-1-1.732 2-1.155L8 9.5l1.5-.866L12 11l2.5-2.366L16 9.5l-2 2.113 2 1.155L15 14.5l-2-1v3h-2z"/>
        </svg>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              key="logo-text"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="min-w-0"
            >
              <p className="text-[13px] font-bold text-white whitespace-nowrap tracking-wide leading-tight">
                LOS TIGRES
              </p>
              <p className="text-[9px] text-zinc-500 whitespace-nowrap tracking-[0.2em] uppercase leading-tight">
                Factory
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <ChevronLeft size={14} />
          }
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {GROUPS.map(group => {
          const isActive = group.key === activeGroup.key
          const Icon = group.icon
          return (
            <div key={group.key}>
              <Link
                href={group.href}
                className={`flex items-center gap-3 px-3 py-[10px] rounded-xl transition-all duration-150 ${
                  isActive
                    ? 'bg-violet-600/15 text-white'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon size={17} strokeWidth={1.75} className="shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      key={`label-${group.key}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap uppercase"
                    >
                      {group.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="sidebar-dot"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>

              {/* Sub-tabs */}
              <AnimatePresence>
                {isActive && group.subTabs.length > 1 && !collapsed && (
                  <motion.div
                    key={`sub-${group.key}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="ml-[14px] mt-1 mb-1 pl-4 border-l border-white/[0.06] space-y-0.5">
                      {group.subTabs.map(tab => (
                        <Link
                          key={tab.href}
                          href={tab.href}
                          className={`flex items-center px-3 py-[7px] rounded-lg text-[11px] transition-colors ${
                            pathname === tab.href
                              ? 'text-white bg-white/[0.07]'
                              : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.03]'
                          }`}
                        >
                          {tab.label}
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

      {/* ── Bottom ────────────────────────────────────────────── */}
      <div className="py-3 px-2 border-t border-white/[0.05] space-y-0.5 shrink-0">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-[9px] rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition"
        >
          <Settings size={16} strokeWidth={1.75} className="shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                key="settings-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[11px] whitespace-nowrap"
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
        <Link
          href="/kpi"
          className="flex items-center gap-3 px-3 py-[9px] rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition"
        >
          <BarChart2 size={16} strokeWidth={1.75} className="shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                key="kpi-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[11px] whitespace-nowrap"
              >
                KPI
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>
    </motion.aside>
  )
}
