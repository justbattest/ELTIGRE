/**
 * Singleton partagé pour l'état des runs carousel.
 * DOIT être dans lib/ (pas dans api/) pour garantir une seule instance de module.
 * Si défini dans une route Next.js, chaque route handler crée sa propre instance.
 */
export const carouselRuns: Map<string, { events: string[]; done: boolean }> = new Map()
