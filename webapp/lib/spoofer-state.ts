/**
 * Singleton partagé pour l'état des runs Spoofer 2.0.
 * DOIT être dans lib/ (pas dans api/) pour garantir une seule instance de module.
 * Si défini dans une route Next.js, chaque route handler crée sa propre instance.
 *
 * Mirror de webapp/lib/metadata-state.ts / carousel-state.ts.
 */
export type SpooferRunState = {
  events: string[]
  done: boolean
  startedAt: number
  userId: string
  uploading?: boolean   // true pendant Phase 1 (avant démarrage Python)
  totalFiles?: number   // nombre de fichiers source attendus
  level?: string        // 'light' | 'medium' | 'aggressive'
  variations?: number   // nombre de variations par fichier
  outputDir?: string    // /tmp/{runId}/output_{runId} — rempli au démarrage Python
}

export const spooferRuns: Map<string, SpooferRunState> = new Map()
