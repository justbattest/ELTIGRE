/**
 * Per-step tutorial video for the 5 Setup Dashboard steps.
 * Written instructions were removed (some had gone stale) in favor of
 * one accurate walkthrough video per step.
 */

export type DashboardStepContent = {
  step: number
  videoId: string
}

export const DASHBOARD_STEPS: DashboardStepContent[] = [
  { step: 1, videoId: 'n7-z8FVjcog' },
  { step: 2, videoId: 'TUYYkLc_8XM' },
  { step: 3, videoId: 'tXxCVfj8flM' },
  { step: 4, videoId: 'yZrY9x2azOY' },
  { step: 5, videoId: '5oFURlesd7g' },
]
