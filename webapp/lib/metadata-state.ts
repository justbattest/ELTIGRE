/**
 * Singleton partagé pour l'état des runs metadata batch.
 * DOIT être dans lib/ (pas dans api/) pour garantir une seule instance de module.
 * Si défini dans une route Next.js, chaque route handler crée sa propre instance.
 */
export type MetadataRunState = {
  events: string[]
  done: boolean
  characterName: string
  startedAt: number
  userId: string
}

export const metadataRuns: Map<string, MetadataRunState> = new Map()
