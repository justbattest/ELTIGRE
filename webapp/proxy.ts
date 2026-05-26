import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: [
    '/',
    '/settings',
    '/kpi',
    '/run/:path*',
    '/api/settings/:path*',
    '/api/characters/:path*',
    '/api/run/:path*',
    '/api/kpi/:path*',
    '/api/higgsfield-auth/:path*',
  ],
}
