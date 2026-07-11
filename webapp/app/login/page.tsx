'use client'

import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRegistered = searchParams.get('registered') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (res?.error) {
      setError('Incorrect email or password')
    } else {
      const status = await fetch('/api/dashboard/status?quick=1').then(r => r.json()).catch(() => null)
      const setupComplete = status ? status.completed >= status.total : true
      router.push(setupComplete ? '/' : '/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-[16px] bg-white flex items-center justify-center overflow-hidden" style={{ boxShadow: '0 0 24px rgba(91,33,245,0.5)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/LOGO.png" alt="Modelify" width={44} height={44} style={{ objectFit: 'contain' }} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Modelify</h1>
          <p className="text-gray-700 text-sm mt-1">AI Content Automation Platform</p>
        </div>

        {/* Message succès inscription */}
        {justRegistered && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 text-center">
            ✅ Account created! Sign in now.
          </div>
        )}

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-6 space-y-4"
        >
          <div>
            <label className="block text-sm text-gray-900 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 transition"
              placeholder="vous@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-900 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-violet-600 to-violet-700 shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-gray-700 text-sm mt-4">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-violet-600 hover:text-violet-700 transition">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
