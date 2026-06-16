/**
 * Singleton partagé pour l'état des runs Motion Concept Builder.
 * DOIT être dans lib/ (pas dans api/) pour garantir une seule instance de module.
 *
 * Chaque entrée représente un "build" en cours ou terminé :
 * URL Instagram → frames → person swap → 4 outfits → MotionConcept en DB.
 */

export type ConceptBuilderState = {
  /** Lignes JSON brutes émises par le subprocess (déjà stringifiées). */
  events: string[]
  /** true quand le subprocess a émis concept_done ou error fatal. */
  done: boolean
  startedAt: number
  userId: string
  /** Rempli dès que le concept_done est reçu. */
  conceptId?: string
}

export const conceptBuilderRuns: Map<string, ConceptBuilderState> = new Map()
