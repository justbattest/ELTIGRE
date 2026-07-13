/**
 * État partagé des runs "Set de référence modèle" (génération Nano Banana i2i).
 * Dans lib/ pour garantir une seule instance de module (comme mc-prep-state).
 */
import type { ChildProcess } from 'child_process'

export type RefsetRunState = {
  userId: string
  events: string[]
  done: boolean
  proc?: ChildProcess
  /** dossier de travail (ancre + prompts.json + images générées) */
  workDir: string
  startedAt: number
}

export const refsetRuns: Map<string, RefsetRunState> = new Map()
