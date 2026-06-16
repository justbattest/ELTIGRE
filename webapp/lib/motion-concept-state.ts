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
  /**
   * true pendant que l'IIFE async (création MotionConcept en DB + push event enrichi)
   * est en cours. Empêche proc.on('close') de fermer le SSE prématurément
   * avant que le concept_id soit disponible pour le client.
   */
  conceptDonePending?: boolean
}

export const conceptBuilderRuns: Map<string, ConceptBuilderState> = new Map()
