/**
 * Singleton partagé pour l'état des runs MC Prep.
 * Doit être dans lib/ (pas dans api/) pour garantir une seule instance de module.
 */
import type { ChildProcess } from 'child_process'

export type MCPrepExtractState = {
  userId: string
  videoPath: string
  frames: { index: number; timestamp: number; path: string }[]
  workDir: string
  createdAt: number
}

export type MCPrepRunState = {
  userId: string
  events: string[]
  done: boolean
  proc?: ChildProcess
  workDir?: string
  startedAt: number
}

/** Extract sessions (Phase 1 — frames disponibles pour affichage) */
export const mcPrepExtracts: Map<string, MCPrepExtractState> = new Map()

/** Generate sessions (Phase 2 — pipeline AI en cours) */
export const mcPrepRuns: Map<string, MCPrepRunState> = new Map()

export type MCPrepBatchState = {
  userId: string
  events: string[]
  done: boolean
  proc?: ChildProcess
  workDir: string
  startedAt: number
  totalItems: number
}

/** Batch sessions (Phase batch — multiple items pipeline) */
export const mcPrepBatchRuns: Map<string, MCPrepBatchState> = new Map()

export type MCPrepBatchExtractVideo = {
  videoIndex: number
  source: string
  videoPath: string
  frames: { index: number; timestamp: number; path: string }[]
}

export type MCPrepBatchExtractState = {
  userId: string
  workDir: string
  videos: MCPrepBatchExtractVideo[]
  createdAt: number
}

export const mcPrepBatchExtracts: Map<string, MCPrepBatchExtractState> = new Map()
