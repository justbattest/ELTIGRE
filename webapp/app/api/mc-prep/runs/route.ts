/**
 * GET /api/mc-prep/runs
 *
 * Retourne la liste des runs MC Prep batch actifs.
 */
import { NextResponse } from 'next/server'
import { mcPrepBatchRuns } from '@/lib/mc-prep-state'

export async function GET() {
  const runs = []
  for (const [runId, state] of mcPrepBatchRuns) {
    // Count completed videos from events
    let completedVideos = 0
    for (const eventStr of state.events) {
      try {
        const evt = JSON.parse(eventStr)
        if (evt.type === 'video_complete') completedVideos++
      } catch {}
    }
    runs.push({
      runId,
      totalItems: state.totalItems,
      startedAt: state.startedAt,
      done: state.done,
      completedVideos,
    })
  }
  return NextResponse.json(runs)
}
