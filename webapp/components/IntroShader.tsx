'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function IntroShader() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!sessionStorage.getItem('tigre_intro')) {
      setVisible(true)
      sessionStorage.setItem('tigre_intro', '1')
      const t = setTimeout(() => setVisible(false), 1800)
      return () => clearTimeout(t)
    }
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          style={{ background: '#030305' }}
        >
          {/* Blob violet */}
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.45, 0.25] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-1/4 left-1/3 w-[520px] h-[520px] rounded-full bg-violet-700/25 blur-[120px] pointer-events-none"
          />
          {/* Blob cyan */}
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.3, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
            className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-cyan-700/15 blur-[100px] pointer-events-none"
          />
          {/* Grille perspective */}
          <div
            className="absolute inset-0 opacity-[0.025] pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          {/* Vignette */}
          <div className="absolute inset-0 bg-radial-gradient pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 50%, transparent 40%, #030305 100%)' }}
          />

          {/* Logo + texte */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: 'easeOut' }}
            className="relative text-center select-none z-10"
          >
            <motion.span
              animate={{ scale: [1, 1.07, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              className="text-[72px] leading-none block mb-5"
            >
              🐯
            </motion.span>

            <h1 className="text-[22px] font-bold tracking-[0.35em] text-white uppercase">
              LOS TIGRES FACTORY
            </h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.4 }}
              className="text-zinc-600 mt-2 text-[11px] tracking-[0.25em] uppercase"
            >
              Content Automation Platform
            </motion.p>

            {/* Barre de progression */}
            <div className="mt-9 w-48 mx-auto h-[1px] bg-white/[0.05] rounded-full overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1.5, delay: 0.3, ease: 'easeOut' }}
                style={{ transformOrigin: 'left' }}
                className="h-full bg-gradient-to-r from-violet-500/60 via-violet-400 to-cyan-500/60 rounded-full"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
