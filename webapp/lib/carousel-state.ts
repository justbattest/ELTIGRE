/**
 * Singleton partagé pour l'état des runs carousel.
 * DOIT être dans lib/ (pas dans api/) pour garantir une seule instance de module.
 * Si défini dans une route Next.js, chaque route handler crée sa propre instance.
 */
export type CarouselRunState = {
  events: string[]
  done: boolean
  characterName: string
  startedAt: number
  userId: string
}

export const carouselRuns: Map<string, CarouselRunState> = new Map()
