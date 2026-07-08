/**
 * Written step-by-step guide content for the 5 Setup Dashboard steps.
 * Kept as plain data (no JSX) so it can be shared without pulling React into
 * server-side code. Mirrors — and is the source of truth for — the numbered
 * guide also shown on /tutorials.
 */

export type DashboardStepContent = {
  step: number
  title: string
  bullets: string[]
}

export const DASHBOARD_STEPS: DashboardStepContent[] = [
  {
    step: 1,
    title: 'Create your Character & Connect Higgsfield',
    bullets: [
      'On higgsfield.ai, create a Soul Cinema Character — this is your base model for image generation.',
      '⚠️ Log into your Higgsfield account in the same browser first, before clicking Connect below.',
      'Click "Connect Higgsfield" and approve the device on the page that opens.',
    ],
  },
  {
    step: 2,
    title: 'Transform your Character into an Element (required for videos)',
    bullets: [
      'Character = generates images | Element = generates videos — these are two separate things.',
      'On higgsfield.ai → Video → Seedance 2.0 → Elements → Check Eligibility.',
      'If eligibility ❌ fails: create an Element by uploading 30 photos of the model (non-sensitive images only).',
      'Finding your Element ID: open DevTools (F12) → Network tab → filter by "reference-elements" → reload the Elements page → copy the UUID from the response.',
      'Images (Nano Banana) are auto-detected via the "Scan from Higgsfield" button below — no manual copying needed for those.',
    ],
  },
  {
    step: 3,
    title: 'Connect your Claude (Anthropic) API Key',
    bullets: [
      'This is independent from your claude.ai account — you need a separate API account.',
      'Go to console.anthropic.com → sign up → Billing → add credits.',
      'Then go to API Keys → create a new key → copy it and paste it below.',
    ],
  },
  {
    step: 4,
    title: 'Connect your OpenAI API Key',
    bullets: [
      'Go to platform.openai.com → API Keys → Create new secret key.',
      'Copy it and paste it below.',
      'Used automatically as the audio transcription (Whisper) engine in Prompt Lab\'s "From Video" mode.',
    ],
  },
  {
    step: 5,
    title: 'Connect Google Drive',
    bullets: [
      'Go to drive.google.com and sign in with the account you want generated content saved to.',
      'Click New → New folder, name it something recognizable (e.g. "Modelify Content"), and open it.',
      'Look at your browser\'s address bar — the URL looks like drive.google.com/drive/folders/1ABC...XYZ. Everything after "folders/" is your folder ID.',
      'Copy just that ID (not the full URL) and paste it into the "Target Drive folder" field below.',
      'Click "Connect Google Drive" and approve access in the popup — this may need reconnecting roughly weekly.',
      'Once both the folder ID is saved and the account is connected, every image/video generated afterward uploads there automatically.',
    ],
  },
]
