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
  Shuffle,
  Timer,
  Settings,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Send,
  BookOpen,
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
    separate: false,
  },
  {
    key: 'video',
    icon: VideoIcon,
    label: 'VIDEO',
    href: '/video',
    pages: ['/video', '/prompt-lab', '/motion-control'],
    subTabs: [
      { label: 'Videos', href: '/video' },
      { label: 'Prompt Lab', href: '/prompt-lab' },
      { label: 'Motion Control', href: '/motion-control' },
    ],
    separate: false,
  },
  { key: 'carousel', icon: LayoutGrid, label: 'CAROUSEL',  href: '/carousel',  pages: ['/carousel'],  subTabs: [], separate: false },
  { key: 'metadata', icon: Wand2,      label: 'METADATA',  href: '/metadata',  pages: ['/metadata'],  subTabs: [], separate: false },
  { key: 'spoofer',  icon: Shuffle,    label: 'SPOOFER',   href: '/spoofer',   pages: ['/spoofer'],   subTabs: [], separate: false },
  { key: 'poster',   icon: Send,       label: 'POSTER',    href: '/poster',    pages: ['/poster'],    subTabs: [], separate: true  },
  { key: 'en-cours', icon: Timer,      label: 'IN PROGRESS', href: '/en-cours', pages: ['/en-cours'],  subTabs: [], separate: false },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const activeGroup = GROUPS.find(g => g.pages.includes(pathname)) ?? GROUPS[0]

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="flex-shrink-0 flex flex-col h-screen sticky top-0 z-40 overflow-hidden"
      style={{
        background: '#ffffff',
        borderRight: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
      }}
    >
      {/* ── Logo ──────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 shrink-0"
        style={{ height: 60, borderBottom: '1px solid rgba(0,0,0,0.07)' }}
      >
        <div
          className="w-8 h-8 rounded-[10px] bg-white flex items-center justify-center shrink-0 overflow-hidden"
          style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08), 0 2px 8px rgba(109,40,217,0.22)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/LOGO.png" alt="Modelify" width={24} height={24} style={{ objectFit: 'contain' }} />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              key="logo-text"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="min-w-0 flex flex-col"
            >
              <p className="text-[15px] font-bold text-gray-900 whitespace-nowrap leading-tight tracking-tight">
                Modelify
              </p>
              <p className="text-[10px] text-gray-400 whitespace-nowrap leading-tight tracking-wider uppercase font-medium">
                AI Studio
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className="flex-1 py-4 px-2.5 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {GROUPS.map(group => {
          const isActive = group.key === activeGroup.key
          const Icon = group.icon
          return (
            <div key={group.key}>
              {group.separate && (
                <div className="my-3 mx-1" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }} />
              )}
              <Link
                href={group.href}
                className={`relative flex items-center gap-3 px-3 py-[9px] rounded-xl transition-all duration-150 ${
                  isActive
                    ? 'text-violet-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(109,40,217,0.09) 0%, rgba(109,40,217,0.04) 100%)',
                  boxShadow: 'inset 0 0 0 1px rgba(109,40,217,0.14)',
                } : {}}
              >
                <Icon size={17} strokeWidth={isActive ? 2.1 : 1.7} className="shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      key={`label-${group.key}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className={`text-[11px] tracking-[0.12em] whitespace-nowrap uppercase ${isActive ? 'font-bold' : 'font-semibold'}`}
                    >
                      {group.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="sidebar-dot"
                    className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: 'rgba(109,40,217,0.7)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>

              {/* Sub-tabs */}
              {isActive && group.subTabs.length > 1 && !collapsed && (
                <div
                  className="ml-[14px] mt-1.5 mb-1.5 pl-4 space-y-0.5"
                  style={{ borderLeft: '2px solid rgba(109,40,217,0.18)' }}
                >
                  {group.subTabs.map(tab => (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className={`flex items-center px-3 py-[7px] rounded-lg text-[12px] font-medium transition-all ${
                        pathname === tab.href
                          ? 'text-gray-900 bg-gray-100/80'
                          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                      }`}
                    >
                      {tab.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── Bottom ────────────────────────────────────────────── */}
      <div className="py-3 px-2.5 space-y-0.5 shrink-0" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
        {[
          { href: '/settings', icon: Settings, label: 'Settings', key: 'settings' },
          { href: '/kpi',      icon: BarChart2, label: 'KPI',      key: 'kpi'      },
          { href: '/tutorials', icon: BookOpen,  label: 'Tutorials', key: 'tutorials' },
        ].map(({ href, icon: Icon, label, key }) => (
          <Link
            key={key}
            href={href}
            className="flex items-center gap-3 px-3 py-[8px] rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition"
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  key={`${key}-label`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[12px] font-medium whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        ))}
      </div>
    </motion.aside>
  )
}
