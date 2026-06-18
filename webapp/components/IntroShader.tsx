'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const LETTERS = 'MODELIFY'.split('')

export function IntroShader() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 2400)
    return () => clearTimeout(t)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          style={{ background: '#f8fafc' }}
        >
          {/* ── Aurora blobs ──────────────────────────────────────── */}
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.22, 0.42, 0.22] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute pointer-events-none"
            style={{
              top: '-10%', left: '15%',
              width: 680, height: 680,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(91,33,245,0.06) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }}
          />
          <motion.div
            animate={{ scale: [1, 1.35, 1], opacity: [0.12, 0.22, 0.12] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 1.3 }}
            className="absolute pointer-events-none"
            style={{
              bottom: '-10%', right: '10%',
              width: 580, height: 580,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
              filter: 'blur(70px)',
            }}
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.08, 0.14, 0.08] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2.5 }}
            className="absolute pointer-events-none"
            style={{
              top: '30%', right: '20%',
              width: 350, height: 350,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(167,139,250,0.04) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />

          {/* ── Grid ──────────────────────────────────────────────── */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              opacity: 0.018,
            }}
          />

          {/* ── Vignette ──────────────────────────────────────────── */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 62% 62% at 50% 50%, transparent 32%, #f8fafc 100%)',
            }}
          />

          {/* ── Center content ────────────────────────────────────── */}
          <div className="relative z-10 flex flex-col items-center select-none">

            {/* Icon card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.45, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1, ease: [0.34, 1.36, 0.64, 1] }}
              className="relative mb-9"
            >
              {/* Pulse ring 1 */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0.9 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 1.05, delay: 0.42, ease: 'easeOut' }}
                className="absolute inset-0 pointer-events-none rounded-[24px]"
                style={{ border: '1.5px solid rgba(91,33,245,0.55)', margin: '-2px' }}
              />
              {/* Pulse ring 2 */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0.65 }}
                animate={{ scale: 3.0, opacity: 0 }}
                transition={{ duration: 1.4, delay: 0.62, ease: 'easeOut' }}
                className="absolute inset-0 pointer-events-none rounded-[24px]"
                style={{ border: '1px solid rgba(91,33,245,0.3)', margin: '-2px' }}
              />

              {/* The card */}
              <div
                className="relative w-[94px] h-[94px] rounded-[22px] overflow-hidden bg-white flex items-center justify-center"
                style={{
                  boxShadow:
                    '0 0 0 1px rgba(91,33,245,0.12), 0 0 50px rgba(91,33,245,0.6), 0 24px 64px rgba(0,0,0,0.65)',
                }}
              >
                {/* Shimmer sweep */}
                <motion.div
                  initial={{ x: '-130%' }}
                  animate={{ x: '230%' }}
                  transition={{ duration: 0.55, delay: 0.48, ease: 'easeInOut' }}
                  className="absolute inset-0 w-1/2 pointer-events-none z-10"
                  style={{
                    transform: 'skewX(-14deg)',
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)',
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/LOGO.png"
                  alt="Modelify"
                  width={74}
                  height={74}
                  style={{ objectFit: 'contain' }}
                />
              </div>
            </motion.div>

            {/* MODELIFY — letter by letter */}
            <div className="flex items-baseline overflow-hidden" style={{ gap: '1px' }}>
              {LETTERS.map((letter, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.38,
                    delay: 0.42 + i * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="text-[30px] font-bold text-slate-900 leading-none"
                  style={{ letterSpacing: '0.11em' }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.98, duration: 0.5 }}
              className="mt-3 text-[10px] uppercase tracking-[0.32em]"
              style={{ color: 'rgba(109,40,217,0.7)' }}
            >
              AI Content Platform
            </motion.p>

            {/* Progress bar */}
            <div
              className="mt-10 rounded-full overflow-hidden"
              style={{ width: 144, height: 1.5, background: 'rgba(0,0,0,0.08)' }}
            >
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1.9, delay: 0.32, ease: 'easeOut' }}
                style={{
                  transformOrigin: 'left',
                  height: '100%',
                  borderRadius: 9999,
                  background:
                    'linear-gradient(90deg, #7c3aed 0%, #a78bfa 50%, #8b5cf6 100%)',
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
