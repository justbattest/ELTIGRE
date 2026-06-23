/**
 * Seed script — Stand de Tir (Shooting Range) Prompts
 * Source : WORKING_PROMPTS-3.md — P50 through P66 (17 prompts)
 *
 * Run: npx tsx scripts/seed-standdetir-prompts.ts
 *
 * Idempotent : upsert basé sur title (safe to re-run)
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

type PromptSeed = {
  niche: string
  subNiche: string
  title: string
  promptJson: string
  outfitText?: string
  speakerLine?: string
  phraseVariations?: string[]
  isBest?: boolean
  sortOrder?: number
}

// ─── Phrases per-prompt ───────────────────────────────────────────────────────
// Chaque groupe = phrases calibrées sur LA scène précise du concept.
// Contexte : stand de tir, elle est coach/instructrice — confidente, légèrement sensuelle.

const PHRASES_P50 = [
  "Relax your shoulders.",
  "Stop tensing up. Let the gun do the work.",
  "Loosen your grip a little... trust me.",
  "Your shoulders are way too high. Drop them.",
  "Easy. You're not arm-wrestling the pistol.",
  "Soft hands, strong stance. Try again.",
  "Feel how tight you are? That's your problem.",
  "Let it go. The tension, I mean.",
]

const PHRASES_P51 = [
  "Relax your shoulders.",
  "You keep looking at me instead of the target.",
  "Eyes forward. I'm not going anywhere.",
  "Focus. I'll still be here when you're done.",
  "Stop glancing back. You're losing your form.",
  "I can feel you holding your breath. Don't.",
  "You're distracted. I wonder why.",
  "Keep your eyes downrange. That's where it counts.",
]

const PHRASES_P52 = [
  "Good job.",
  "That was clean. Do it again.",
  "See? You're better than you think.",
  "Keep that up and you won't need me anymore.",
  "Nice. Real nice.",
  "That's the one. Right there.",
  "You felt that, didn't you? That's the sweet spot.",
  "Good. Now do it exactly like that every time.",
]

const PHRASES_P53 = [
  "Good job.",
  "You're doing well... just like that.",
  "Don't change a thing. Stay right there.",
  "Feel how smooth that was? That's you.",
  "Perfect. Just keep breathing.",
  "There it is. Now hold that feeling.",
  "See what happens when you stop fighting it?",
  "That's it. Don't overthink it.",
]

const PHRASES_P54 = [
  "Breathe with me... deep and slow.",
  "Match my breathing. In... and out.",
  "Slow it down. Feel the rhythm.",
  "Your breath controls everything. Sync with mine.",
  "Deep breath in... hold... now release.",
  "Slow and steady. Just like that.",
  "Follow my pace. In... out... good.",
  "Don't rush. Let your breath guide the trigger.",
]

const PHRASES_P55 = [
  "Breathe with me... deep and slow.",
  "That recoil hit hard. You okay?",
  "Lean into it next time. I've got you.",
  "You stumbled right into me. Not complaining.",
  "The kick surprised you, huh? We'll fix that.",
  "Brace harder. Or don't — I'll catch you.",
  "That's a lot of recoil for you. We'll work on it.",
  "Next time, push forward before you fire.",
]

const PHRASES_P56 = [
  "Breathe with me... deep and slow.",
  "Stay centered. Don't drift.",
  "Keep your core tight. I'll guide you.",
  "You're swaying. Lock your hips.",
  "Feel my breathing against your back? Match it.",
  "Steady. I'm right here.",
  "Let the rhythm settle before you squeeze.",
  "Don't fight the movement. Control it.",
]

const PHRASES_P57 = [
  "Breathe with me... deep and slow.",
  "Sync up. I'll set the pace.",
  "In through the nose... out through the mouth.",
  "You're rushing. Slow down with me.",
  "Feel that? That's what controlled breathing does.",
  "Your heart rate just dropped. Good.",
  "One more breath together. Then fire.",
  "That's it. You've got this.",
]

const PHRASES_P58 = [
  "Aiee!",
  "Oh my god, that's hot!",
  "Ow ow ow — right down the shirt!",
  "That went straight into my top!",
  "Brass down the collar — classic!",
  "Every single time with this top!",
  "Note to self: zip up next time.",
  "That's gonna leave a mark!",
]

const PHRASES_P59 = [
  "Aiee!",
  "That one really got me!",
  "Okay THAT was not funny!",
  "Hot brass, open neckline — bad combo!",
  "Right between the — okay, ow!",
  "I teach gun safety but not fashion safety!",
  "Every damn time with the casings!",
  "That is officially the worst spot for a burn!",
]

const PHRASES_P60 = [
  "Ahh!",
  "Yes! Nailed it!",
  "Did you see that grouping?!",
  "Every single round on target!",
  "That's what I'm talking about!",
  "Tell me that wasn't perfect!",
  "I could do this all day!",
  "Clean sweep — not a single miss!",
]

const PHRASES_P61 = [
  "Ahh!",
  "All hits, all center!",
  "That mag was flawless!",
  "Rapid fire and still tight grouping!",
  "Watch and learn, boys!",
  "Full mag, zero misses!",
  "That felt incredible!",
  "Try keeping up with that!",
]

const PHRASES_P62 = [
  "Yes!",
  "Three jumps because I earned it!",
  "That was the best string I've ever shot!",
  "Full send, full hit, full celebration!",
  "I can't even contain myself right now!",
  "Every round dead center!",
  "That's what peak performance looks like!",
  "Somebody tell them I don't miss!",
]

const PHRASES_P63 = [
  "Let me check this is snug enough.",
  "Hold still — your earpro is crooked.",
  "Can't have you losing your hearing on my watch.",
  "Let me adjust this before you fire again.",
  "Your protection is slipping. Let me fix it.",
  "Safety first. Come here.",
  "Tilt your head a little. There.",
  "One second — this earcup isn't sealed right.",
]

const PHRASES_P64 = [
  "Your heart's racing.",
  "I can feel it from here. Calm down.",
  "Slow your pulse before you squeeze.",
  "Your heartbeat is the enemy right now.",
  "Feel that? Too fast. Match mine.",
  "Take a second. You're not ready yet.",
  "I need you calm before I let you fire.",
  "Close your eyes. Breathe. Then we go.",
]

const PHRASES_P65 = [
  "Copy my stance. Exactly like this.",
  "Feel that? That's balanced.",
  "Mirror everything I do.",
  "Back to back. Match my weight distribution.",
  "When our stances match, you'll feel the difference.",
  "Press into me. Find your center.",
  "That's it. Now you're grounded.",
  "Hold this position. Don't break contact.",
]

const PHRASES_P66 = [
  "Mind if I borrow your target? Mine's boring.",
  "See, I don't need lessons. You might though.",
  "Your lane looked more interesting than mine.",
  "Don't worry — I'll give it back in better shape.",
  "I just wanted to see if your target was easier.",
  "My grouping's tighter than yours. Just saying.",
  "You should watch how it's done up close.",
  "I'll take this lane. You can have mine.",
]

const PROMPTS: PromptSeed[] = [

  // ═══════════════════════════════════════════════════════════════════
  // STAND DE TIR — Coach sensuelle / Tireuse provocante
  // ═══════════════════════════════════════════════════════════════════

  // ── P50 — Coach grip · "Relax your shoulders... See?" · V1 ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Coach grip · "Relax your shoulders... See?" · V1',
    sortOrder: 1,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold necklace',
    speakerLine: "Relax your shoulders.",
    phraseVariations: PHRASES_P50,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly behind and to the side. Indoor shooting range: concrete ceiling with exposed metal beams, shooting lanes extending into background, another shooter blurred in distance, dim industrial lighting with faint haze. Man standing centre frame aiming pistol downrange. Woman positioned just behind and beside him.",
        motion_intensity: 0.36,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Man stands aiming pistol at target, focused and tense. Woman behind him speaks her first line. She steps in closer. Both hands move onto his hand wrapped around the grip, adjusting his fingers. Leans her head in close beside his ear, speaking softly. One hand slides from his grip down to rest on his hip, gently repositioning his stance. He adjusts his feet wider. Gunshot. She leans in even closer, lips near his ear, soft satisfied tone. Gunshot. She pulls back slightly, smiling, hand still resting on his hip.",
        dialogue: "[Woman, low and confident]: 'Relax your shoulders.' — [Woman, close to his ear, soft]: 'Let me fix your grip.' — [Woman, guiding his stance]: 'Widen your stance a little.' — [gunshot] — [Woman, close, satisfied]: 'There you go. Much better.' — [gunshot] — [Woman, smiling]: 'See?'"
      },
      {
        style: "fixed medium shot slightly behind and to the side, indoor shooting range, concrete ceiling exposed beams, shooting lanes background, dim industrial lighting faint haze, no colour grading, candid realistic feel — fitted olive green zip-up crop top deep V neckline showing prominent cleavage, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold necklace"
      }
    ])
  },

  // ── P51 — Coach grip · Variation regard fuyant · V2 ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Coach grip · Variation regard fuyant · V2',
    sortOrder: 2,
    outfitText: 'fitted olive green zip-up crop top deep V neckline prominent cleavage, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold necklace',
    speakerLine: "Relax your shoulders.",
    phraseVariations: PHRASES_P51,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly behind and to the side. Indoor shooting range: concrete ceiling exposed metal beams, shooting lanes background, distant blurred shooter, dim industrial lighting faint haze. Man centre frame aiming pistol, woman just behind him.",
        motion_intensity: 0.36,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Man aims pistol, visibly tense. Woman speaks behind him. He glances back briefly, distracted by her closeness. Both her hands wrap over his hand on the grip. Leans in, head beside his ear. He swallows, eyes flicking toward her then back to the target. Her hand slides down to his hip, repositioning his stance firmly. He widens his feet, breath unsteady. Gunshot. She stays close, satisfied. Gunshot. Steps back slightly, smiling, watching him.",
        dialogue: "[Woman, low]: 'Relax your shoulders.' — [Woman, close to ear]: 'Let me fix your grip.' — [Woman, hand on hip]: 'Widen your stance a little.' — [gunshot] — [Woman, satisfied]: 'There you go. Much better.' — [gunshot] — [Woman, smiling]: 'See?'"
      },
      {
        style: "fixed medium shot slightly behind and to the side, indoor shooting range, concrete ceiling exposed beams, shooting lanes background, dim industrial lighting faint haze, no colour grading, candid realistic feel — fitted olive green zip-up crop top deep V neckline prominent cleavage, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold necklace"
      }
    ])
  },

  // ── P52 — Push-in vlog · "Good job... just like that" · V1 ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Push-in vlog · "Good job... just like that" · V1',
    sortOrder: 3,
    outfitText: 'black tank top deep neckline, clear safety glasses, olive green over-ear hearing protection, long dark hair with bangs, thin gold pendant necklace, long acrylic nails, black thigh holster with a holstered pistol strapped to her leg',
    speakerLine: "Good job.",
    phraseVariations: PHRASES_P52,
    promptJson: JSON.stringify([
      {
        framing: "Camera starts as a wider observer shot slightly behind and to the side, then pushes in closer as the woman moves to his side — settling into a close handheld vlog-style two-shot, chest-up framing. Indoor shooting range: corrugated metal ceiling with hanging sound baffles, shooting lane dividers, brass casings scattered on the ground, red-and-black striped safety post, other shooters with caps blurred in background, dim practical lighting, faint haze.",
        motion_intensity: 0.37,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Man aims pistol downrange, woman behind him stroking his lower back slowly. Gunshot. He lowers the pistol to a safe low position. Camera pushes in as she steps to his side, palm sliding up from his back to flatten against his chest. Leans her head close, lips near his ear. He swallows, shoulders tensing. She speaks her first line, voice dropping lower. His eyes drop to her hand, avoiding her gaze entirely. Fingers curl slightly against his hoodie, stroking as she speaks her second line. He shifts his weight, visibly flustered, eyes staying low.",
        dialogue: "[Woman, low and sensual]: 'Good job.' — [Woman, soft, hand pressing his chest]: 'You're doing well... just like that.'"
      },
      {
        style: "shot on iPhone 15 Pro front camera, 26mm equivalent, eye-level handheld, no flash — close vlog-style two-shot transitioning from a wider push-in, indoor shooting range, corrugated metal ceiling with hanging baffles, shooting lane dividers, brass casings on ground, red-and-black striped safety post, other shooters blurred background, dim practical fluorescent lighting, faint haze drifting, cool fluorescent white-grey highlights, deep grey shadows, muted cool midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing black tank top deep neckline, clear safety glasses, olive green over-ear hearing protection, long dark hair with bangs, thin gold pendant necklace, long acrylic nails, black thigh holster with a holstered pistol strapped to her leg, visible skin pores and natural texture, slight sheen on both faces, loose flyaway hairs. Man wearing grey hoodie, olive ear protection slightly askew, natural skin texture, no smoothing, no airbrushing, no studio lighting"
      }
    ])
  },

  // ── P53 — Push-in vlog · "Good job" · V2 contact continu ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Push-in vlog · "Good job" · V2 contact continu',
    sortOrder: 4,
    outfitText: 'black tank top deep neckline, clear safety glasses, olive green over-ear hearing protection, long dark hair with bangs, thin gold pendant necklace, long acrylic nails, black thigh holster with a holstered pistol strapped to her leg',
    speakerLine: "Good job.",
    phraseVariations: PHRASES_P53,
    promptJson: JSON.stringify([
      {
        framing: "Camera starts as a wider observer shot slightly behind and to the side, then pushes in closer as the woman moves to his side — settling into a close handheld vlog-style two-shot, chest-up framing. Indoor shooting range: corrugated metal ceiling with hanging sound baffles, shooting lane dividers, brass casings scattered on the ground, red-and-black striped safety post, other shooters with caps blurred in background, dim practical lighting, faint haze.",
        motion_intensity: 0.36,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Man aims pistol downrange. Woman behind him, hand stroking slowly along his lower back without ever losing contact. Gunshot. He lowers the pistol to a safe low position. Camera pushes in as she steps to his side, hand trailing continuously from his back up over his shoulder, then settling flat on his chest. Leans in, lips near his ear, speaks her first line softly. He looks down at her hand, avoiding her eyes. Her thumb moves slowly back and forth against the fabric as she speaks her second line. He keeps his gaze low the entire time, breath caught, shifting slightly under her touch.",
        dialogue: "[Woman, low and sensual]: 'Good job.' — [Woman, soft, stroking his chest]: 'You're doing well... just like that.'"
      },
      {
        style: "shot on iPhone 15 Pro front camera, 26mm equivalent, eye-level handheld, no flash — close vlog-style two-shot transitioning from a wider push-in, indoor shooting range, corrugated metal ceiling with hanging baffles, shooting lane dividers, brass casings on ground, red-and-black striped safety post, other shooters blurred background, dim practical fluorescent lighting, faint haze drifting, cool fluorescent white-grey highlights, deep grey shadows, muted cool midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing black tank top deep neckline, clear safety glasses, olive green over-ear hearing protection, long dark hair with bangs, thin gold pendant necklace, long acrylic nails, black thigh holster with a holstered pistol strapped to her leg, visible skin pores and natural texture, slight sheen on both faces, loose flyaway hairs. Man wearing grey hoodie, olive ear protection slightly askew, natural skin texture, no smoothing, no airbrushing, no studio lighting"
      }
    ])
  },

  // ── P54 — "Breathe with me" · Recul qui colle · V1 turtleneck ── BEST
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: '"Breathe with me" · Recul qui colle · V1 turtleneck',
    isBest: true,
    sortOrder: 5,
    outfitText: 'fitted olive green long-sleeve turtleneck top, fingerless tactical gloves, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold pendant necklace, thigh holster with holstered pistol',
    speakerLine: "Breathe with me... deep and slow.",
    phraseVariations: PHRASES_P54,
    promptJson: JSON.stringify([
      {
        framing: "Close handheld two-shot from the side at shoulder height, both faces visible in profile. Indoor shooting range: tan-beige walls, metal ceiling truss structure, hanging target retrieval cables, brass casings scattered on the ground, red safety line on the floor, gun case open on a table with a second pistol visible, other shooters firing and bystanders visible blurred in background.",
        motion_intensity: 0.34,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman stands close behind man, chest gently touching his back. Speaks her first line softly. Breathes in deeply and slowly, her chest pressing more firmly against his back with the breath. He inhales matching her rhythm. She speaks her second line, hand resting on his side guiding his posture upward. He raises the pistol, aims, fires. The recoil pushes him backward — he stumbles half a step directly into her, his back colliding with her chest and shoulder. She doesn't move away, absorbing the contact naturally. She leans in close to his ear, voice low and sensual, soft laugh escaping. Her hand slides slowly across his upper back as she speaks her final line, fingers trailing.",
        dialogue: "[Woman, soft and slow]: 'Breathe with me... deep and slow.' — [Woman, guiding]: 'Up your chest, stay loose and controlled.' — [gunshot, recoil] — [Woman, low and sensual, soft laugh]: 'Mmm... you're doing so good.'"
      },
      {
        style: "shot on iPhone 15 Pro front camera, 26mm equivalent, eye-level handheld, no flash — close two-shot profile, indoor shooting range, tan-beige walls, exposed metal ceiling trusses, hanging cables, brass casings on concrete floor, red safety line, gun case on table background, other shooters and bystanders blurred background, warm tan-beige highlights from the wall colour, deep grey-brown shadows in the ceiling structure, muted warm neutral midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing fitted olive green long-sleeve turtleneck top, fingerless tactical gloves, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold pendant necklace, thigh holster with holstered pistol, visible skin pores and natural texture, slight sheen on both faces, loose flyaway hairs. Man wearing olive green crew-neck shirt, clear safety glasses, short dark hair, natural skin texture, no smoothing, no airbrushing, no studio lighting, no glamour lighting"
      }
    ])
  },

  // ── P55 — "Breathe with me" · Recul plus fort · V2 turtleneck ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: '"Breathe with me" · Recul plus fort · V2 turtleneck',
    sortOrder: 6,
    outfitText: 'fitted olive green long-sleeve turtleneck top, fingerless tactical gloves, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold pendant necklace, thigh holster with holstered pistol',
    speakerLine: "Breathe with me... deep and slow.",
    phraseVariations: PHRASES_P55,
    promptJson: JSON.stringify([
      {
        framing: "Close handheld two-shot from the side at shoulder height, both faces visible in profile. Indoor shooting range: tan-beige walls, metal ceiling truss structure, hanging target retrieval cables, brass casings scattered on the ground, red safety line on the floor, gun case open on a table with a second pistol visible, other shooters firing and bystanders visible blurred in background.",
        motion_intensity: 0.36,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman stands close behind man, chest already touching his back. Speaks her first line softly, slowly. Breathes in deeply, the breath visibly lifting her chest further into his back. He inhales, matching her. She speaks her second line, hand pressing flat against his side, guiding his posture. He raises the pistol and fires. The recoil is strong — his whole upper body jolts backward, pressing firmly into her chest and shoulder for a full beat before he steadies himself. She holds her ground, unbothered, hand staying on him the entire time. She leans her head in close, lips near his ear. Soft sensual laugh. Speaks her final line slowly, fingers trailing down his arm.",
        dialogue: "[Woman, soft and slow]: 'Breathe with me... deep and slow.' — [Woman, guiding]: 'Up your chest, stay loose and controlled.' — [gunshot, strong recoil] — [Woman, low and sensual, soft laugh]: 'Mmm... you're doing so good.'"
      },
      {
        style: "shot on iPhone 15 Pro front camera, 26mm equivalent, eye-level handheld, no flash — close two-shot profile, indoor shooting range, tan-beige walls, exposed metal ceiling trusses, hanging cables, brass casings on concrete floor, red safety line, gun case on table background, other shooters and bystanders blurred background, warm tan-beige highlights from the wall colour, deep grey-brown shadows in the ceiling structure, muted warm neutral midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing fitted olive green long-sleeve turtleneck top, fingerless tactical gloves, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold pendant necklace, thigh holster with holstered pistol, visible skin pores and natural texture, slight sheen on both faces, loose flyaway hairs. Man wearing olive green crew-neck shirt, clear safety glasses, short dark hair, natural skin texture, no smoothing, no airbrushing, no studio lighting, no glamour lighting"
      }
    ])
  },

  // ── P56 — "Breathe with me" · Caméra qui drift · V3 turtleneck ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: '"Breathe with me" · Caméra qui drift · V3 turtleneck',
    sortOrder: 7,
    outfitText: 'fitted olive green long-sleeve turtleneck top, fingerless tactical gloves, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold pendant necklace, thigh holster with holstered pistol',
    speakerLine: "Breathe with me... deep and slow.",
    phraseVariations: PHRASES_P56,
    promptJson: JSON.stringify([
      {
        framing: "Close handheld two-shot from the side at shoulder height, both faces visible in profile, camera drifting slightly with their movement. Indoor shooting range: tan-beige walls, metal ceiling truss structure, hanging target retrieval cables, brass casings scattered on the ground, red safety line on the floor, gun case open on a table with a second pistol visible, other shooters firing and bystanders visible blurred in background.",
        motion_intensity: 0.35,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman stands close behind man, chest touching his back. Speaks her first line softly. Breathes in slowly and deliberately, her chest rising against him. He breathes in sync. She speaks her second line, hand sliding to rest flat against his side. He raises the pistol, fires. Recoil snaps him backward into her — camera drifts very slightly with the impact. He catches himself against her, lingering a half-second longer than necessary before stepping back into position. She tilts her head toward his ear, soft sensual laugh first, then speaks her final line slowly, hand trailing down his arm as she pulls back slightly.",
        dialogue: "[Woman, soft and slow]: 'Breathe with me... deep and slow.' — [Woman, guiding]: 'Up your chest, stay loose and controlled.' — [gunshot, recoil] — [Woman, soft laugh first, then low and sensual]: 'Mmm... you're doing so good.'"
      },
      {
        style: "shot on iPhone 15 Pro front camera, 26mm equivalent, eye-level handheld, no flash — close two-shot profile with slight camera drift on impact, indoor shooting range, tan-beige walls, exposed metal ceiling trusses, hanging cables, brass casings on concrete floor, red safety line, gun case on table background, other shooters and bystanders blurred background, warm tan-beige highlights from the wall colour, deep grey-brown shadows in the ceiling structure, muted warm neutral midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing fitted olive green long-sleeve turtleneck top, fingerless tactical gloves, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold pendant necklace, thigh holster with holstered pistol, visible skin pores and natural texture, slight sheen on both faces, loose flyaway hairs. Man wearing olive green crew-neck shirt, clear safety glasses, short dark hair, natural skin texture, no smoothing, no airbrushing, no studio lighting, no glamour lighting"
      }
    ])
  },

  // ── P57 — "Breathe with me" · Variante décolleté zip-up · V4 ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: '"Breathe with me" · Variante décolleté zip-up · V4',
    sortOrder: 8,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage, fingerless tactical gloves, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold pendant necklace, thigh holster with holstered pistol',
    speakerLine: "Breathe with me... deep and slow.",
    phraseVariations: PHRASES_P57,
    promptJson: JSON.stringify([
      {
        framing: "Close handheld two-shot from the side at shoulder height, both faces visible in profile. Indoor shooting range: tan-beige walls, metal ceiling truss structure, hanging target retrieval cables, brass casings scattered on the ground, red safety line on the floor, gun case open on a table with a second pistol visible, other shooters firing and bystanders visible blurred in background.",
        motion_intensity: 0.34,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman stands close behind man, chest gently touching his back. Speaks her first line softly. Breathes in deeply and slowly, her chest pressing more firmly against his back with the breath. He inhales matching her rhythm. She speaks her second line, hand resting on his side guiding his posture upward. He raises the pistol, aims, fires. The recoil pushes him backward — he stumbles half a step directly into her, his back colliding with her chest and shoulder. She doesn't move away, absorbing the contact naturally. She leans in close to his ear, voice low and sensual, soft laugh escaping. Her hand slides slowly across his upper back as she speaks her final line, fingers trailing.",
        dialogue: "[Woman, soft and slow]: 'Breathe with me... deep and slow.' — [Woman, guiding]: 'Up your chest, stay loose and controlled.' — [gunshot, recoil] — [Woman, low and sensual, soft laugh]: 'Mmm... you're doing so good.'"
      },
      {
        style: "shot on iPhone 15 Pro front camera, 26mm equivalent, eye-level handheld, no flash — close two-shot profile, indoor shooting range, tan-beige walls, exposed metal ceiling trusses, hanging cables, brass casings on concrete floor, red safety line, gun case on table background, other shooters and bystanders blurred background, warm tan-beige highlights from the wall colour, deep grey-brown shadows in the ceiling structure, muted warm neutral midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing fitted olive green zip-up crop top deep V neckline showing prominent cleavage, fingerless tactical gloves, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold pendant necklace, thigh holster with holstered pistol, visible skin pores and natural texture, slight sheen on both faces, loose flyaway hairs. Man wearing olive green crew-neck shirt, clear safety glasses, short dark hair, natural skin texture, no smoothing, no airbrushing, no studio lighting, no glamour lighting"
      }
    ])
  },

  // ── P58 — Douille brûlante dans le décolleté · "Aiee!" · V1 cargo ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Douille brûlante dans le décolleté · "Aiee!" · V1 cargo',
    sortOrder: 9,
    outfitText: 'tight black long-sleeve zip-up top with deep open neckline, prominent cleavage, fitted olive cargo pants, high ponytail, clear safety glasses, black over-ear hearing protection, tactical belt',
    speakerLine: "Aiee!",
    phraseVariations: PHRASES_P58,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot from behind, woman centre frame firing rapid shots downrange. Indoor shooting range: concrete walls, shooting table with magazine and casings, brass scattered across the floor, red safety line.",
        motion_intensity: 0.40,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman fires rapid shots in quick succession. A stray hot casing lands down her open collar. She jolts, pulling the pistol down and away from the line fast. Spins toward camera. Sharp 'Aiee!' — stung, eyes wide. Quick hand motion at her collar retrieving it. Tosses it down. Bursts into laughter, shoulders shaking.",
        dialogue: "[rapid gunfire] — [Woman, sharp, stung]: 'Aiee!' — [Woman, bright laugh]: 'That burned!'"
      },
      {
        style: "fixed medium shot, indoor shooting range, concrete walls, shooting table with magazine and casings, brass on floor, red safety line, natural practical lighting, cool grey-white highlights, deep shadows, no colour grading, no cinematic polish, candid realistic feel — tight black long-sleeve zip-up top with deep open neckline, prominent cleavage, fitted olive cargo pants, high ponytail, clear safety glasses, black over-ear hearing protection, tactical belt"
      }
    ])
  },

  // ── P59 — Douille brûlante · "Aiee!" · V2 — BEST ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Douille brûlante · "Aiee!" · V2 — BEST',
    isBest: true,
    sortOrder: 10,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold necklace, tactical belt',
    speakerLine: "Aiee!",
    phraseVariations: PHRASES_P59,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot from behind, woman centre frame firing rapid shots downrange. Indoor shooting range: concrete walls, shooting table with magazine and casings, brass scattered across the floor, red safety line.",
        motion_intensity: 0.41,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman fires rapid shots. Brass ejects with each round. One casing drops into her open collar. She flinches. Stops firing immediately. Turns to camera. Sharp 'Aiee!' Hand reaches into collar fast. Retrieves casing. Flicks it away. Laughs, bright and genuine.",
        dialogue: "[rapid gunfire] — [Woman, sharp]: 'Aiee!' — [Woman, laughing]: 'That one really got me!'"
      },
      {
        style: "shot on iPhone 15 Pro rear camera, 26mm equivalent, eye-level handheld, no flash — fixed medium shot, indoor shooting range, concrete walls, shooting table with magazine and casings, brass on floor, red safety line, cool grey-white highlights, deep neutral grey shadows, muted cool midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — fitted olive green zip-up crop top deep V neckline showing prominent cleavage, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, gold necklace, tactical belt, visible skin pores and natural texture, slight sheen on the skin, loose flyaway hairs, no smoothing, no airbrushing, no studio lighting, no glamour lighting"
      }
    ])
  },

  // ── P60 — Tir rapide + sauts + spectateurs choqués · V1 ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Tir rapide + sauts + spectateurs choqués · V1',
    sortOrder: 11,
    outfitText: 'fitted olive green ribbed long-sleeve crop top, black ruched scrunch shorts with side cutout and matching belt, thigh holster with double garter straps and a holstered second pistol, black over-the-knee boots, long straight jet-black hair',
    speakerLine: "Ahh!",
    phraseVariations: PHRASES_P60,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot from behind, woman centre frame firing rapid shots downrange at multiple silhouette targets. Camera holds position as she finishes, turns to face camera laughing, then bends forward retrieving something from her thigh holster. After the bend, camera pans right and slightly back to reveal two onlookers in an adjacent lane, both visibly stunned, staring. Indoor shooting range: white ceiling with metal target rail system, multiple target hangers, faint haze drifting near the dark bullet trap backdrop, concrete floor with painted red safety lines, white range divider wall with pegboard panel on the left, black shooting bench, white waist-high cabinet with a phone resting on top, brass casings scattered extensively across the floor catching the overhead light.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman fires rapid successive shots downrange, brass ejecting with each round. She lowers the pistol to a safe position. Turns to face camera, bright laugh. Does two quick small excited hops in place, sharp happy 'eee!' sounds with each hop. Bends forward at the waist, reaching toward her thigh holster. Camera pans right revealing two people in the next lane who have stopped shooting, mouths open, staring at her.",
        dialogue: "[rapid gunfire] — [Woman, bright laugh]: 'Ahh!' — [small excited hop, sharp 'eee!'] — [another hop, breathless laugh] — [onlookers, stunned silence]"
      },
      {
        style: "shot on iPhone 15 Pro rear camera, 26mm equivalent, eye-level handheld with slight pan, no flash — indoor shooting range, white painted concrete walls, metal target rail ceiling system, cool white fluorescent overhead lighting, faint haze near the dark bullet trap, concrete floor with red painted safety lines, brass casings scattered and catching cool highlights, white range divider with pegboard, black shooting bench, white waist-high cabinet with phone, cool white-grey highlights, deep neutral grey shadows, muted cool midtones, slight handheld micro-shake, motion blur on quick movements, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — fitted olive green ribbed long-sleeve crop top, black ruched scrunch shorts with side cutout and matching belt, thigh holster with double garter straps and a holstered second pistol, black over-the-knee boots, long straight jet-black hair, natural skin texture and visible pores, slight sheen on the skin, no smoothing, no airbrushing, no studio lighting"
      }
    ])
  },

  // ── P61 — Tir rapide + sauts + spectateurs · V2 décolleté zip-up ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Tir rapide + sauts + spectateurs · V2 décolleté zip-up',
    sortOrder: 12,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage, black ruched scrunch shorts with side cutout, thigh holster double garter straps holstered pistol, black over-the-knee boots, long jet-black hair, gold necklace',
    speakerLine: "Ahh!",
    phraseVariations: PHRASES_P61,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot from behind, woman firing rapid shots downrange. Camera holds as she turns to face it, then bends toward her thigh holster, then pans right to reveal stunned onlookers in the next lane. Indoor shooting range: white ceiling target rail system, hanging silhouette targets, haze near dark bullet trap, concrete floor red safety lines, white pegboard wall, black shooting bench, white cabinet with phone, brass casings scattered on floor.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman fires rapid shots. Lowers pistol. Turns to camera laughing. Two quick hops, sharp happy cries. Bends forward toward her thigh holster. Camera pans right. Two onlookers in next lane stand frozen, staring.",
        dialogue: "[rapid gunfire] — [Woman, laughing]: 'Ahh!' — [hop, 'eee!'] — [hop, laugh] — [onlookers stunned]"
      },
      {
        style: "shot on iPhone 15 Pro rear camera, 26mm equivalent, eye-level handheld with slight pan, no flash — indoor shooting range, white concrete walls, metal target rail ceiling, cool white fluorescent lighting, faint haze near bullet trap, concrete floor red safety lines, brass casings scattered, white pegboard divider, black shooting bench, white cabinet with phone, cool white-grey highlights, deep neutral grey shadows, muted cool midtones, slight handheld micro-shake, motion blur on quick movement, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — fitted olive green zip-up crop top deep V neckline showing prominent cleavage, black ruched scrunch shorts with side cutout, thigh holster double garter straps holstered pistol, black over-the-knee boots, long jet-black hair, gold necklace, natural skin texture, visible pores, slight sheen, no smoothing, no airbrushing, no studio lighting, no glamour lighting"
      }
    ])
  },

  // ── P62 — Tir rapide + 3 sauts + spectateurs · V3 décolleté zip-up ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: 'Tir rapide + 3 sauts + spectateurs · V3 décolleté zip-up',
    sortOrder: 13,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage, black ruched scrunch shorts with side cutout and matching belt, thigh holster with double garter straps and holstered second pistol, black over-the-knee boots, long straight jet-black hair, gold necklace',
    speakerLine: "Yes!",
    phraseVariations: PHRASES_P62,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot from behind, woman centre frame firing rapid shots downrange at multiple silhouette targets. Camera holds as she turns to face it laughing, then bends forward toward her thigh holster. Camera then pans right and slightly back to reveal two onlookers in the adjacent lane, stunned. Indoor shooting range: white ceiling with metal target rail system, multiple hanging targets, faint haze near the dark bullet trap backdrop, concrete floor with red safety lines, white pegboard divider wall left, black shooting bench, white waist-high cabinet with phone, brass casings scattered across the floor catching overhead light.",
        motion_intensity: 0.46,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman fires rapid shots downrange. Lowers pistol. Turns to camera, delighted laugh. Three quick excited hops, hips bouncing with each one, sharp 'eee!' cries escaping with the first two hops. Bends forward sharply at the waist reaching for her thigh holster, hair swinging with the motion. Camera pans right, revealing two shooters in the next lane frozen mid-motion, staring wide-eyed.",
        dialogue: "[rapid gunfire] — [Woman, delighted]: 'Yes!' — [hop, sharp 'eee!'] — [hop, breathless 'eee!'] — [hop, laughing] — [onlookers frozen, silent]"
      },
      {
        style: "shot on iPhone 15 Pro rear camera, 26mm equivalent, eye-level handheld with slight pan, no flash — indoor shooting range, white painted concrete walls, metal target rail ceiling system, cool white fluorescent overhead lighting, faint haze near the dark bullet trap, concrete floor with red painted safety lines, brass casings scattered catching cool highlights, white pegboard divider, black shooting bench, white waist-high cabinet with phone, cool white-grey highlights, deep neutral grey shadows, muted cool midtones, slight handheld micro-shake, motion blur on quick movements, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — fitted olive green zip-up crop top deep V neckline showing prominent cleavage, black ruched scrunch shorts with side cutout and matching belt, thigh holster with double garter straps and holstered second pistol, black over-the-knee boots, long straight jet-black hair, gold necklace, natural skin texture and visible pores, slight sheen on skin, no smoothing, no airbrushing, no studio lighting, no glamour lighting"
      }
    ])
  },

  // ── P63 — "Earpro check" · Toucher mâchoire/cou ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: '"Earpro check" · Toucher mâchoire/cou',
    sortOrder: 14,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage with visible ribbed fabric texture and tension creasing at the underbust, clear safety glasses, black over-ear hearing protection slightly off-centre, long dark hair with bangs, asymmetric flyaway strands on one side, gold pendant necklace',
    speakerLine: "Let me check this is snug enough.",
    phraseVariations: PHRASES_P63,
    promptJson: JSON.stringify([
      {
        framing: "Close handheld two-shot from the side at shoulder height. Indoor shooting range: poured concrete wall with patches of chipped beige paint revealing grey concrete beneath, faint formwork tie-holes in a row, metal target rail truss with slightly rusted bolt joints, haze drifting toward ventilation, denser near the floor of the backstop, brass casings scattered in an irregular fan pattern, some tarnished and some freshly bright.",
        motion_intensity: 0.32,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Man stands with pistol lowered, ear protection slightly askew from movement. Woman steps close beside him. Reaches up with both hands to adjust his ear protection, fingers brushing his jaw and the edge of his ear as she repositions it. Speaks her first line while adjusting. He goes still, breath caught. She presses the earcup gently snug, fingers lingering against his jawline a beat longer than needed. Speaks her second line, soft. He swallows. She steps back slightly, satisfied smile, eyes on him.",
        dialogue: "[Woman, low, focused]: 'Let me check this is snug enough.' — [Woman, fingers at his jaw, soft]: 'Can't have you losing your hearing... or anything else.' — [Man, quiet, caught off guard]: 'I'm fine.' — [Woman, soft laugh]: 'I know you are.'"
      },
      {
        style: "shot on iPhone 15 Pro front camera, 26mm equivalent, eye-level handheld, no flash — close two-shot profile, indoor shooting range, poured concrete wall with chipped beige paint patches and faint formwork tie-holes, metal target rail truss with slightly rusted bolts, drifting haze denser near the backstop floor, brass casings irregular fan pattern mixed tarnished and bright, unstable fluorescent colour temperature between fixtures, cool white-grey highlights with faint yellow-white inconsistency from older tubes, deep neutral grey shadows with subtle double shadow edges, muted cool midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing fitted olive green zip-up crop top deep V neckline showing prominent cleavage with visible ribbed fabric texture and tension creasing at the underbust, clear safety glasses, black over-ear hearing protection slightly off-centre, long dark hair with bangs, asymmetric flyaway strands on one side, gold pendant necklace, visible skin pores and natural texture, localised sheen at temples and nape, no smoothing, no airbrushing, no studio lighting, no glamour lighting"
      }
    ])
  },

  // ── P64 — "Steady your heartbeat" · Main sur le torse ── BEST
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: '"Steady your heartbeat" · Main sur le torse',
    isBest: true,
    sortOrder: 15,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage, ribbed fabric texture with tension creasing, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, asymmetric flyaway strands, gold pendant necklace',
    speakerLine: "Your heart's racing.",
    phraseVariations: PHRASES_P64,
    promptJson: JSON.stringify([
      {
        framing: "Close handheld two-shot from the front-side angle, both faces visible. Indoor shooting range: poured concrete wall with chipped paint patches, metal target rail truss overhead, drifting haze near the backstop, brass casings scattered irregularly on the floor, other shooters blurred far background.",
        motion_intensity: 0.33,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Man stands holding pistol lowered, chest rising fast, visibly nervous. Woman steps directly in front of him, close. Speaks her first line. Places one flat palm against the centre of his chest, feeling his heartbeat. He freezes completely. She tilts her head, eyes on his, breathing slow and deliberate. Speaks her second line. He matches her breathing, shoulders dropping. She nods once, satisfied. Steps back just enough for him to raise the pistol. Gunshot. She glances at the target, then back at him. Speaks her final line, faint smile.",
        dialogue: "[Woman, low, noticing]: 'Your heart's racing.' — [Woman, palm on his chest]: 'Match my breathing.' — [silence, both breathing] — [gunshot] — [Woman, glancing at target, smiling]: 'Better. Much better.'"
      },
      {
        style: "shot on iPhone 15 Pro front camera, 26mm equivalent, eye-level handheld, no flash — close two-shot, indoor shooting range, poured concrete wall chipped beige paint, metal target rail truss with rusted bolt joints, drifting haze denser near backstop floor, brass casings irregular pattern mixed tarnish, other shooters blurred background, unstable fluorescent colour temperature, cool white-grey highlights with faint warm inconsistency, deep neutral grey shadows, muted cool midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing fitted olive green zip-up crop top deep V neckline showing prominent cleavage, ribbed fabric texture with tension creasing, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, asymmetric flyaway strands, gold pendant necklace, visible skin pores and natural texture, localised sheen, no smoothing, no airbrushing, no studio lighting, no glamour lighting. Man wearing olive green crew-neck shirt with visible chest rise and fall, natural skin texture, slight flush at the neck, no smoothing"
      }
    ])
  },

  // ── P65 — "Mirror stance" · Dos à dos ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: '"Mirror stance" · Dos à dos',
    sortOrder: 16,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage, ribbed fabric texture with tension creasing at the back, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, asymmetric flyaway strands, gold pendant necklace, thigh holster with holstered pistol',
    speakerLine: "Copy my stance. Exactly like this.",
    phraseVariations: PHRASES_P65,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot from the side, both figures visible standing back to back facing opposite directions. Indoor shooting range: poured concrete wall chipped paint, metal target rail truss overhead, drifting haze near backstop, brass casings scattered on floor, shooting lane dividers receding into haze.",
        motion_intensity: 0.34,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Man stands with poor wide stance, pistol lowered, uncertain. Woman steps behind him, turns to face the opposite direction, and slowly steps backward until her back presses lightly against his. Speaks her first line. Both stand back to back, her weight settling into his stance. She shifts her hips and feet slightly, guiding his posture through the contact of her back against his. He adjusts to mirror her. Speaks her second line. He raises the pistol behind her, aims forward. Gunshot. She doesn't move away, smiling slightly, feeling the recoil pass faintly through his shifted stance.",
        dialogue: "[Woman, calm, instructive]: 'Copy my stance. Exactly like this.' — [she settles back to back with him] — [Woman, low]: 'Feel that? That's balanced.' — [gunshot] — [Woman, smiling]: 'See, you held it.'"
      },
      {
        style: "shot on iPhone 15 Pro rear camera, 26mm equivalent, eye-level fixed, slight handheld micro-shake, no flash — fixed medium side shot, indoor shooting range, poured concrete wall with chipped beige paint and faint formwork tie-holes, metal target rail truss with rusted bolt joints, drifting haze denser near the backstop floor, brass casings irregular fan pattern, lane dividers receding into haze, unstable fluorescent colour temperature between fixtures, cool white-grey highlights with faint warm inconsistency, deep neutral grey shadows with subtle double-shadow edges, muted cool midtones, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing fitted olive green zip-up crop top deep V neckline showing prominent cleavage, ribbed fabric texture with tension creasing at the back, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, asymmetric flyaway strands, gold pendant necklace, thigh holster with holstered pistol, visible skin pores and natural texture, localised sheen, no smoothing, no airbrushing, no studio lighting, no glamour lighting. Man wearing olive green crew-neck shirt, natural skin texture, no smoothing"
      }
    ])
  },

  // ── P66 — "Mind if I borrow your target" · Intruse ──
  {
    niche: 'standdetir',
    subNiche: 'standdetir',
    title: '"Mind if I borrow your target" · Intruse',
    sortOrder: 17,
    outfitText: 'fitted olive green zip-up crop top deep V neckline showing prominent cleavage, ribbed fabric texture, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, asymmetric flyaway strands, gold pendant necklace, thigh holster with holstered pistol',
    speakerLine: "Mind if I borrow your target? Mine's boring.",
    phraseVariations: PHRASES_P66,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly behind and to the side, man centre frame at his shooting station. Woman enters frame from the adjacent lane, stepping into his space. Indoor shooting range: poured concrete wall chipped paint, metal target rail truss overhead, drifting haze near backstop, brass casings scattered on floor, adjacent empty lane visible.",
        motion_intensity: 0.38,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Man stands alone at his lane, pistol lowered between shots. Woman steps in from the side, uninvited, standing close beside him. Speaks her first line, casual and confident. He glances at her, caught off guard. She steps even closer, taking the pistol gently from his hand without asking. Raises it herself, fires one clean controlled shot downrange. Lowers it, hands it back, speaks her second line with a slight smirk. He looks at her, then at the target, speechless.",
        dialogue: "[Woman, casual, confident]: 'Mind if I borrow your target? Mine's boring.' — [gunshot, clean single shot] — [Woman, handing pistol back, smirking]: 'See, I don't need lessons. You might though.'"
      },
      {
        style: "shot on iPhone 15 Pro rear camera, 26mm equivalent, eye-level handheld, no flash — fixed medium shot, indoor shooting range, poured concrete wall chipped beige paint, metal target rail truss rusted bolt joints, drifting haze denser near backstop floor, brass casings irregular pattern mixed tarnish, adjacent empty lane visible, unstable fluorescent colour temperature, cool white-grey highlights, deep neutral grey shadows, muted cool midtones, slight handheld micro-shake, subtle film grain, no colour grading, no cinematic polish, candid realistic feel — woman wearing fitted olive green zip-up crop top deep V neckline showing prominent cleavage, ribbed fabric texture, clear safety glasses, black over-ear hearing protection, long dark hair with bangs, asymmetric flyaway strands, gold pendant necklace, thigh holster with holstered pistol, visible skin pores and natural texture, localised sheen, no smoothing, no airbrushing, no studio lighting, no glamour lighting. Man wearing grey or olive shirt, natural skin texture, no smoothing"
      }
    ])
  },

]

async function main() {
  console.log(`\n🌱 Seeding ${PROMPTS.length} stand de tir prompts...\n`)

  let created = 0
  let updated = 0

  for (const p of PROMPTS) {
    const existing = await prisma.validatedPrompt.findFirst({
      where: { title: p.title },
    })

    const phraseVariationsJson = p.phraseVariations ? JSON.stringify(p.phraseVariations) : null

    if (existing) {
      await prisma.validatedPrompt.update({
        where: { id: existing.id },
        data: {
          promptJson: p.promptJson,
          outfitText: p.outfitText ?? null,
          speakerLine: p.speakerLine ?? null,
          phraseVariations: phraseVariationsJson,
          isBest: p.isBest ?? false,
          sortOrder: p.sortOrder ?? 0,
        },
      })
      updated++
      console.log(`  ↻ Updated: ${p.title} (${p.phraseVariations?.length ?? 0} phrases)`)
    } else {
      await prisma.validatedPrompt.create({
        data: {
          niche: p.niche,
          subNiche: p.subNiche,
          title: p.title,
          promptJson: p.promptJson,
          outfitText: p.outfitText ?? null,
          speakerLine: p.speakerLine ?? null,
          phraseVariations: phraseVariationsJson,
          isBest: p.isBest ?? false,
          sortOrder: p.sortOrder ?? 0,
        },
      })
      created++
      console.log(`  + Created: ${p.title}`)
    }
  }

  console.log(`\n✅ Done — ${created} créés, ${updated} mis à jour\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
