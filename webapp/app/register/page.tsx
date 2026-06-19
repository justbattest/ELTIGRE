'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState('')
  const [loading,         setLoading]         = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error creating account')
        return
      }

      // Compte créé → rediriger vers login avec message de succès
      router.push('/login?registered=1')
    } catch {
      setError('Network error, please try again.')
    } finally {
      setLoading(false)
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
          <p className="text-gray-700 text-sm mt-1">Create an account</p>
        </div>

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
              onChange={e => setEmail(e.target.value)}
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
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 transition"
              placeholder="8 characters minimum"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-900 mb-1">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
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
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-gray-700 text-sm mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-violet-600 hover:text-violet-700 transition">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
