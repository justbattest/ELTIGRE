import { redirect } from 'next/navigation'

/**
 * The Settings page has been merged into the Setup Dashboard (/dashboard).
 * This stub keeps old links/bookmarks working by redirecting.
 */
export default function SettingsPage() {
  redirect('/dashboard')
}
