import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
  callbacks: {
    // `/mcp` (serveur MCP Modelify) s'authentifie par clé API, pas par cookie
    // de session — il ne doit JAMAIS être redirigé vers /login. Il n'est de
    // toute façon pas dans le matcher ci-dessous (allowlist), mais on l'exclut
    // ici explicitement comme garde-fou si quelqu'un l'y ajoute plus tard.
    // Tout autre chemin garde le comportement d'origine (token requis).
    authorized: ({ req, token }) =>
      req.nextUrl.pathname.startsWith('/mcp') ? true : token != null,
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
