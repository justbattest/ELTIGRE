/**
 * Seed script — Validated Prompts (Conférence + Sport)
 * Source : WORKING_PROMPTS-3.md (Kling 3.0 → Seedance 2.0 compatible)
 *
 * Run: npx tsx scripts/seed-validated-prompts.ts
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
// Principe : 100% défendable dans le contexte professionnel → quand une femme
// ultra-attractive le dit dans CETTE scène, l'effet est complètement différent.

const PHRASES_INAUGURATION = [
  "I know exactly what every person in this room came to see today — and I plan to show you everything.",
  "Today I am putting it all on the table. Nothing is going to be held back.",
  "I want you to leave here today feeling like you've seen something you have never seen before.",
  "I've been preparing this for months. I cannot wait to finally expose everything to you.",
  "This is the moment I stop covering things up. You're going to get the full picture today.",
  "I hope you all got a good seat — because you're going to want a clear view of everything I'm about to bring.",
  "By the end of today, none of you are going to be able to look away from me.",
  "What you see right now is just the beginning. It gets much more impressive from here.",
]

const PHRASES_AUDITORIUM = [
  // Cours de débat — elle enseigne l'assurance face au public, angle du bas révèle culotte
  "In this class, I need you completely comfortable staring directly at me — that's where the work happens.",
  "I can already see some of you having trouble keeping your eyes where they should be.",
  "The most important thing about public speaking? Never be embarrassed about what people see.",
  "I know some of you are struggling to focus right now. Trust me — it only gets more challenging.",
  "Everyone in this room is going to look at me very differently by the end of today.",
  "I have never had a class that walked out of here without being completely changed by what they saw.",
  "Some of you are going to feel very exposed by what I'm about to ask of you.",
  "The real lesson today is learning how to control yourself when you're completely overwhelmed.",
]

const PHRASES_CONFERENCE_DISTRACTION = [
  // Conférence sur la distraction — ironie : le mec derrière elle glisse de sa chaise en la regardant
  "Gentlemen — learn to control your impulses. That is the foundation of everything I'm teaching today.",
  "The most dangerous thing in any professional environment? Letting your eyes wander somewhere they shouldn't.",
  "I have seen this exact same thing happen every single time I speak in a room full of men.",
  "Focus. I haven't even gotten to the really stimulating part of the presentation yet.",
  "If you think this is hard to get through, wait until we get to the section on self-control.",
  "I promise you — the content of this presentation is far more distracting than whatever else caught your attention.",
  "Every single time. Without exception. Every time I step on this stage, the same thing happens.",
  "I'm used to this. I've learned to keep going no matter what's happening around me.",
]

const PHRASES_KINE = [
  // Kiné examinant un joueur blessé — mains sur abdomen bas/cuisses, questions médicales = double-sens parfait
  "I need you to tell me exactly where you feel the most tension. Be specific — don't hold anything back.",
  "Don't be embarrassed. Everything you're feeling is completely normal. Just tell me what's going on down there.",
  "On a scale of one to ten — how stiff are we talking? I need to know exactly what I'm dealing with.",
  "I'm going to work my hands down until I find exactly where the issue is.",
  "I want you completely relaxed. The more tense you are, the harder this is going to be for both of us.",
  "I've worked with a lot of athletes. Nothing you can say to me is going to surprise me.",
  "The more you can describe what you're feeling, the better I can position myself to fix it.",
  "I'm going to apply pressure in a few different areas. You tell me the moment something feels wrong.",
]

const PHRASES_COACH_PISTE = [
  // Coach qui se retourne après que l'élève a murmuré un commentaire sur elle
  "I need all eyes on me right now. Stop looking at each other. Eyes. On. Me.",
  "Someone in this room is not taking this seriously, and I will find out who it is.",
  "Every time I turn my back, something happens in this room. That stops today.",
  "You think I don't notice? I notice everything. Every look. Every reaction. Always.",
  "One of you is staying after everyone else leaves, and we're working this out one on one.",
  "I can hear every whisper. Every single comment said in this room reaches me.",
  "You don't want me to turn around and find out it's you.",
  "I've been patient. I'm running out of patience very quickly.",
]

const PHRASES_COOLDOWN = [
  // Coach tourne le dos aux élèves, se penche jusqu'aux chevilles — élèves sourient
  "The deeper you push, the better it's going to feel. Don't be afraid to go all the way down.",
  "Good. Hold it there. All the way down. Don't come back up until I tell you to.",
  "I need you completely loose before we go any further. Just let everything go.",
  "Trust me — once you've gone this deep, you're going to want to do it again.",
  "Copy every single thing I do. Every movement. Don't miss anything.",
  "Go further than you think you can. That's where the real release happens.",
  "Eyes on me. If you're not watching exactly what I'm doing, you're doing it wrong.",
  "Stay open. Stay low. The more committed you are to this position, the more you get out of it.",
]

const PHRASES_VOLLEYBALL = [
  // Coach descend en position défensive volleyball dos à la caméra — posture très basse et ouverte
  "Everyone down low. Wide. Open. Match exactly what I'm showing you.",
  "I need you completely focused on my form right now — this is the most important position in the game.",
  "Get your eyes on my backside technique. This is where most teams fall apart.",
  "Don't look away. The moment you look away, you miss everything.",
  "I want you low and ready. Completely spread. That's how you win from the back.",
  "Keep watching. It gets deeper from here.",
  "Stay in this position as long as you possibly can.",
  "The team that fully commits to this position wins every single time.",
]

const PROMPTS: PromptSeed[] = [

  // ═══════════════════════════════════════════════════════════════════
  // CONFÉRENCE
  // ═══════════════════════════════════════════════════════════════════

  // ── P2 — Inauguration · Culotte sous tension musculaire · Chuchoteur + cameraman ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P2 — Inauguration · Culotte + chuchoteur + cameraman',
    isBest: true,
    sortOrder: 10,
    outfitText: 'White fitted shirt open at neckline, extremely tight short black skirt',
    speakerLine: 'Thanks a lot guys for being here for my inauguration day—',
    phraseVariations: PHRASES_INAUGURATION,
    promptJson: JSON.stringify([
      {
        framing: "Audience POV from first row angled slightly upward toward elevated stage. Real conference room, warm stage lighting, deep red velvet curtain backdrop. Graduation caps blurred foreground. A man in the front row is visibly holding up his phone filming toward the stage.",
        motion_intensity: 0.33,
        action: "Powerfully muscular woman at stage microphone. White fitted shirt open at neckline, extremely tight short black skirt clinging to every muscle — fabric under such tension from her athletic build that the hemline has crept upward naturally, just barely exposing the edge of red underwear from this upward angle. Man in front row has phone raised and clearly aimed upward at the stage. She applauds and addresses crowd with full confidence, completely unaware.",
        dialogue: "[Woman, warm and professional, microphone]: 'Thanks a lot guys for being here for my inauguration day—'"
      },
      {
        framing: "Same upward POV. Man with phone still visible in foreground, still filming.",
        motion_intensity: 0.38,
        action: "A tall man in dark suit approaches from her right, hand cupped to mouth, whispering urgently in her ear. She freezes mid-sentence. Eyes drop toward her hemline. Brief flash of realisation. Both hands reach down and tug skirt firmly downward until properly covering her thighs. Red underwear no longer visible. She exhales quietly and straightens. Man in front row lowers his phone slowly.",
        dialogue: "[Inaudible urgent male whisper — ambient crowd murmur]"
      },
      {
        framing: "Same upward POV, woman back at microphone, composed.",
        motion_intensity: 0.30,
        action: "Recovered professional smile, skirt now properly down. She leans into the microphone without missing a beat.",
        dialogue: "[Woman, warm and bright]: 'We are going to have an amazing time — thank you all for being here!'"
      },
      {
        framing: "Same POV — she pivots away to hand off microphone.",
        motion_intensity: 0.44,
        action: "She passes microphone to the man and turns fully away from crowd. Camera holds. Her extraordinarily developed and rounded lower physique faces camera completely — tight short black skirt stretched fully across it as she walks away. Man in front row raises his phone again.",
        dialogue: "[Sustained applause]"
      },
      {
        style: "first row audience POV angled upward, warm professional stage lighting, red velvet curtain, real graduation conference setting, handheld natural feel, no colour grading — skirt rides up purely from extreme fabric tension against muscular build. Man in front row with phone is a distinct visible character throughout, his filming reaction mirrors the audience perspective"
      }
    ])
  },

  // ── P3-V1 — Auditorium · Single shot · Garçon filme + femme gifle ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P3-V1 — Auditorium · Single shot · Garçon filme + gifle',
    sortOrder: 20,
    outfitText: 'Very tight ruched dark mini skirt',
    speakerLine: 'The first thing you learn about today is to ask questions and not be afraid to speak out.',
    phraseVariations: PHRASES_AUDITORIUM,
    promptJson: JSON.stringify([
      {
        framing: "Single continuous shot — POV from auditorium seat front row angled upward at elevated wooden stage edge. Camera very close to stage — stage lip fills bottom of frame. School auditorium, recessed spotlights, burgundy curtains, projection screen reading 'Speak Up Stand Out — Debate Training 2026 — Greenville High School'. American flag stage left. Teenage boy and adult woman seated immediately beside camera visible in foreground.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular woman standing at the very front edge of the stage, close to the audience, facing the crowd directly — not walking sideways, body turned toward audience. Very tight ruched dark mini skirt stretched taut across powerful thighs. Because she faces the audience directly and the camera is below stage level looking straight up, the narrow gap between her inner thighs is visible from this upward angle — small glimpse of red underwear fabric visible only in the central gap, appearing naturally as she shifts her weight and moves slightly in place. She holds microphone, gestures with free arm, speaks directly to audience, completely unaware. Teenage boy in foreground slowly tilts phone upward toward stage. Adult woman beside him notices, reaches over and snatches phone sharply. Speaker catches commotion, glances down to her own hemline, raises free hand to mouth — instant mortification.",
        dialogue: "[Speaker, confident teaching voice]: 'The first thing you learn about today is to ask questions and not be afraid to speak out.' — [Adult woman, furious whisper]: 'Are you fucking serious?' — [Uncomfortable student laughter — auditorium murmur]"
      },
      {
        style: "single continuous handheld shot no cuts, tight upward POV from front row very close to stage edge, warm auditorium spotlights, burgundy curtains, no colour grading, candid feel — speaker facing audience directly throughout, red underwear glimpsed only in narrow central gap between inner thighs from below-stage upward angle, not a wide band. All characters visible in same frame throughout"
      }
    ])
  },

  // ── P3-V2 — Auditorium · Multi-shot · Meilleure sur la culotte ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P3-V2 — Auditorium · Multi-shot · Meilleure culotte',
    isBest: true,
    sortOrder: 21,
    outfitText: 'black stilettos, very tight ruched dark mini skirt',
    speakerLine: 'The first thing you learn about today is to ask questions and not be afraid to speak out.',
    phraseVariations: PHRASES_AUDITORIUM,
    promptJson: JSON.stringify([
      {
        framing: "POV from auditorium seat third row angled upward at elevated wooden stage. School auditorium, recessed spotlights, burgundy curtains, projection screen reading 'Speak Up Stand Out — Debate Training 2026 — Greenville High School'. American flag stage left. Students' heads foreground.",
        motion_intensity: 0.44,
        action: "Extremely muscular woman pacing stage left to right, black stilettos, very tight ruched dark mini skirt stretched taut across powerful thighs. As she walks and her legs separate with each stride, the upward camera angle reveals a small glimpse of red underwear fabric visible only in the narrow gap between her inner thighs at centre — the red appears and disappears slightly with each step as her legs move. Holds microphone confidently, gestures freely, completely unaware.",
        dialogue: "[Speaker, confident teaching voice]: 'The first thing you learn about today is to ask questions and not be afraid to speak out.'"
      },
      {
        framing: "Same upward POV. Teenage boy front row lifts phone toward stage.",
        motion_intensity: 0.38,
        action: "Teenage boy tilts phone upward aimed at stage. Adult woman beside him immediately notices, reaches over and snatches it sharply.",
        dialogue: "[Adult woman, furious whisper]: 'Are you fucking serious?'"
      },
      {
        framing: "Speaker notices front row disturbance.",
        motion_intensity: 0.30,
        action: "Speaker slows, glances to front row then down to her hemline. Raises free hand to mouth. Mortified expression.",
        dialogue: "[Uncomfortable student laughter — auditorium murmur]"
      },
      {
        style: "handheld upward audience POV, school auditorium spotlights, no colour grading, candid feel — red underwear glimpsed only in narrow central gap between inner thighs as legs move, not visible as a wide horizontal band, appears naturally from below-stage angle during stride"
      }
    ])
  },

  // ── P3-V3 — Auditorium · Triangle central géométrique ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P3-V3 — Auditorium · Triangle central géométrique',
    sortOrder: 22,
    outfitText: 'black stiletto heels. Very tight ruched dark mini skirt',
    speakerLine: 'The first thing you learn about today is to ask questions and not be afraid to speak out.',
    phraseVariations: PHRASES_AUDITORIUM,
    promptJson: JSON.stringify([
      {
        framing: "POV from auditorium seat third row, camera naturally angled upward toward elevated wooden stage. Institutional school auditorium: recessed ceiling spotlights, burgundy velvet curtains stage sides, large projection screen displaying 'Speak Up Stand Out — Debate Training 2026 — Greenville High School'. American flag stage left. Wooden stage edge visible. Students' heads in foreground.",
        motion_intensity: 0.44,
        action: "Extremely muscular athletic woman walking stage left to right in black stiletto heels. Very tight ruched dark mini skirt — fabric under extreme tension across powerful thighs, hemline riding high. From this upward camera angle, a small triangular glimpse of red fabric is visible at the centre between her thighs — not wide, not a band, just a narrow central triangle where the skirt fails to cover. She holds microphone, gestures naturally, makes confident eye contact with audience, completely unaware.",
        dialogue: "[Speaker, warm authoritative teaching voice]: 'The first thing you learn about today is to ask questions and not be afraid to speak out.'"
      },
      {
        framing: "Same upward third-row POV. Teenage boy front row slowly lifts phone toward stage.",
        motion_intensity: 0.38,
        action: "Teenage boy tilts phone upward toward stage, screen glowing. Adult woman to his right clocks it immediately, jaw clenching — reaches over and snatches phone in one sharp motion.",
        dialogue: "[Adult woman, fierce controlled whisper]: 'Are you fucking serious?'"
      },
      {
        framing: "Speaker on stage registers disturbance.",
        motion_intensity: 0.30,
        action: "Speaker's stride slows. Eyes drift to front row then instinctively to her own hemline. Free hand rises slowly to cover her mouth. Expression shifts from confident to visibly mortified.",
        dialogue: "[Sparse uncomfortable student laughter — ambient auditorium]"
      },
      {
        style: "handheld audience POV angled upward, warm ceiling spotlights, burgundy curtains, projection screen backdrop, wooden stage edge, no colour grading — small triangular glimpse of red underwear visible only at centre between thighs from upward angle, not a wide band or shorts-like coverage, just a narrow central triangle due to stage elevation and skirt tension"
      }
    ])
  },

  // ── P4-A — Conférence assise · Sous table · Meilleure scène ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P4-A — Assise sous table · Cameraman pan · Meilleure scène',
    isBest: true,
    sortOrder: 30,
    outfitText: 'blue fitted button-down shirt deep open neckline, extremely short black mini skirt',
    // speakerLine omitted (no speaker line)
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot — first row audience POV, camera angled slightly upward toward elevated stage. Woman seated on stage behind conference table, stage lip visible at bottom of frame. Formal auditorium conference setup: long dark wood table on elevated stage, black folding chairs, American flag on stand left, large white projection screen behind. Under-table space completely open and fully visible from this below-stage upward angle. Multiple audience members' heads and shoulders visible in foreground. Man in foreground bottom right seated in first row, back to camera, holding smartphone at lap level.",
        motion_intensity: 0.38,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular woman seated behind conference table on elevated stage, blue fitted button-down shirt deep open neckline, extremely short black mini skirt — skirt riding up naturally in seated position. Her knees are relaxed and apart, and because the camera is below stage level looking upward into the open under-table space, red underwear is visible as a small central area between her thighs, not wide not a band, only the narrow central gap. Man in dark navy suit already leaning slightly beside her from the start — bends closer to her ear and whispers. She looks downward toward her own lap — expression not purely embarrassed but coquettish and self-aware, a slight knowing look. Man in foreground first row performs a slow casual wide panning movement with his smartphone, sweeping deliberately left across the room then back right — phone travels wide away from her, appearing to film the whole audience and room generally, before the pan completes and phone settles back aimed at the under-table space from his low seated angle. As he finishes his pan she reaches down and tugs skirt hem firmly downward pressing knees together — red underwear no longer visible.",
        dialogue: "[Man in suit, low whisper directly in her ear]: 'We can see your panties.' — [Woman glances down, expression coquettish and slightly amused, no words] — [Man in foreground, barely audible satisfied murmur as pan ends]: 'Fuck yeah, I've got a good one.'"
      },
      {
        style: "fixed medium shot angled slightly upward from first row audience below stage level, stage lip at bottom of frame, harsh institutional fluorescent lighting, shadow under table making red underwear visible by contrast, American flag left, white projection screen behind, multiple audience heads visible in foreground, no colour grading, candid feel — red underwear small central area only between thighs not wide not a band, visible from below-stage upward angle into open under-table space, knees apart natural seated position. All three characters visible in same frame throughout"
      }
    ])
  },

  // ── P4-B — Conférence assise · Sous table · Meilleure culotte ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P4-B — Assise sous table · Meilleure culotte',
    sortOrder: 31,
    outfitText: 'blue fitted button-down shirt deep open neckline, extremely short black skirt',
    // speakerLine omitted (no speaker line)
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot — audience POV, camera at table level looking straight ahead. Conference room: long dark wood table, black folding chairs, American flag on stand left, large white projection screen behind. Under-table space completely open and visible from camera. Man foreground bottom right back-to-camera holding smartphone.",
        motion_intensity: 0.38,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular woman seated behind conference table, blue fitted button-down shirt deep open neckline, extremely short black skirt riding up in seated position — red underwear visible as small central area between thighs in open under-table space from straight-on angle, not a band not wide. Her knees are naturally apart in relaxed seated position. Man in dark navy suit already slightly leaning beside her from the start — bends to her ear and whispers. She glances down toward her lap, expression coquettish and self-aware, slight knowing smile — not shame. Man in foreground begins a slow deliberate wide pan with his smartphone, sweeping left across the room then right — a casual convincing general sweep as if filming the whole room, phone travelling wide away from the woman before completing the sweep back. As his pan completes and phone returns aimed at under-table space, she simultaneously reaches down and pulls skirt hem firmly downward pressing knees together. Red underwear disappears.",
        dialogue: "[Man suit, low whisper at her ear]: 'We can see your panties.' — [Woman glances down, slight coquettish smile, silent] — [Man foreground, quiet satisfied murmur as pan completes]: 'Fuck yeah, I've got a good one.'"
      },
      {
        style: "fixed medium shot, flat frontal table-level angle, harsh fluorescent overhead lighting casting shadow under table making red visible by contrast, American flag left, large white projection screen behind, no colour grading, candid conference room atmosphere — red underwear small central area between thighs only, not wide not a band, visible from straight-on angle and open under-table space with skirt riding up naturally in seated position. All three characters visible in same frame throughout"
      }
    ])
  },

  // ── P4-C — Conférence assise · Triangle minimaliste ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P4-C — Assise sous table · Triangle minimaliste',
    sortOrder: 32,
    outfitText: 'blue deep-neckline shirt, very short black skirt',
    // speakerLine omitted (no speaker line)
    promptJson: JSON.stringify([
      {
        framing: "Fixed straight-on medium shot at table level. Conference room, dark wood table, open under-table space fully visible, American flag left, white screen behind. Man in foreground back-to-camera filming with phone.",
        motion_intensity: 0.40,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Muscular woman seated at conference table, blue deep-neckline shirt, very short black skirt riding up — in the open under-table space visible from this straight-on angle, a small central triangle of red underwear shows between her thighs, not a band, not wide, just the narrow central gap. Man in navy suit already leaning slightly beside her at the start — comes closer to whisper in her ear. She glances down at her lap. Expression: coquettish, self-aware, a hint of amusement — not shame. Man in foreground makes a slow wide casual phone pan left to right across the room. His pan ends. At that exact moment she tugs skirt firmly down. Red gone.",
        dialogue: "[Man suit whisper]: 'We can see your panties.' — [Woman glances down, slight knowing smile] — [Man foreground, end of pan, quiet]: 'Fuck yeah, I've got a good one.'"
      },
      {
        style: "fixed straight-on medium shot, table level, fluorescent lighting shadow under table makes red contrast sharply, American flag left, no colour grading — red underwear narrow central triangle only between thighs, not wide not a band, open under-table space and short skirt seated position"
      }
    ])
  },

  // ── P5-V1 — Dos au public · Culotte triangle visible ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P5-V1 — Dos au public · Culotte triangle · Gifle copine',
    sortOrder: 40,
    outfitText: 'white long-sleeve top, extremely short black mini skirt, beige heels',
    // speakerLine omitted (no speaker line)
    promptJson: JSON.stringify([
      {
        framing: "CONTINUOUS SINGLE SHOT NO CUTS — second row audience POV angled upward at elevated stage. Woman close in frame. Wooden stage floor, podium left, American flag gold eagle stand, burgundy curtains backdrop, empty stage behind her. Young man in audience front row directly below stage edge filming upward. Girlfriend in same front row seat immediately beside him.",
        motion_intensity: 0.46,
        action: "Extremely muscular woman on stage, white long-sleeve top, extremely short black mini skirt, beige heels. Talks to man beside podium then pivots to face podium — back to audience. The skirt hemline sits so high on her muscular body that as she turns and leans slightly forward, a distinct triangle of red fabric — her underwear — is visible at the centre back between her thighs, red colour clearly visible, not a wide band, not shorts, just the central triangular area of red underwear where the skirt cannot cover. She leans toward podium conversing. Young man below stage level raises phone filming upward at her. Girlfriend beside him in same row notices immediately, turns and slaps him hard across the cheek. Girlfriend speaks. He places hand on cheek slowly, turns back to students seated behind with stunned face. Students burst out laughing and reacting.",
        dialogue: "[Girlfriend, furious]: 'Babe what the actual fuck.' — [Burst of laughter from students around]"
      },
      {
        style: "handheld audience POV second row angled upward, wooden stage, podium, American flag, burgundy curtains, empty stage no one else on stage, no colour grading, candid — red underwear visible as distinct central triangle between thighs at back, not wide not a band not shorts, caused by skirt too short when turned and leaning. Man filming from audience below stage level, girlfriend same row beside him"
      }
    ])
  },

  // ── P5-V2 — Dos au public · Scène globale ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P5-V2 — Dos au public · Meilleure scène globale',
    sortOrder: 41,
    outfitText: 'white long-sleeve fitted top, extremely short tight black mini skirt, beige stiletto heels',
    // speakerLine omitted (no speaker line)
    promptJson: JSON.stringify([
      {
        framing: "CONTINUOUS SINGLE SHOT NO CUTS — audience POV from second row, camera angled slightly upward toward elevated wooden stage. Close to stage — woman fills most of frame. School auditorium: wooden podium left, American flag gold eagle stand, deep burgundy curtains, empty stage behind her. Stage edge at bottom of frame. Young man in audience front row below stage level, back slightly to camera, holding phone up. Girlfriend seated immediately to his right same row.",
        motion_intensity: 0.46,
        action: "Extremely muscular woman on elevated stage, white long-sleeve fitted top, extremely short tight black mini skirt, beige stiletto heels. She stands beside the wooden podium talking to man in blue suit. She then turns to face the podium, rotating her back toward the audience. As she turns, the extremely short skirt — hemline already sitting just below the waist — reveals a small triangle of red underwear fabric visible at the central gap between her thighs, not wide not a band, just the narrow central triangle of red fabric at the back visible because skirt is too short when leaning forward. She leans toward podium, back to crowd. Young man in audience raises phone and films. Girlfriend immediately beside him in same row slaps him firmly on the cheek. She says her line. He raises hand to slapped cheek, turns to face students behind him stunned. Students around erupt laughing.",
        dialogue: "[Girlfriend, sharp]: 'Babe what the actual fuck.' — [Student laughter erupting around them]"
      },
      {
        style: "handheld second row audience POV angled upward, close to stage, warm wooden stage floor, wooden podium, American flag gold eagle, burgundy curtains, empty stage behind woman, no colour grading — small triangle of red underwear visible at central back gap, not wide not a band, skirt too short when turned and leaning forward. Young man and girlfriend in audience front row below stage, not on stage"
      }
    ])
  },

  // ── P5-V5 — Dos au public · MEILLEURE GLOBALEMENT ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P5-V5 — Dos au public · MEILLEURE globalement',
    isBest: true,
    sortOrder: 42,
    outfitText: 'white long-sleeve fitted top, extremely short tight black mini skirt that barely covers her lower body',
    // speakerLine omitted (no speaker line)
    promptJson: JSON.stringify([
      {
        framing: "CONTINUOUS SINGLE SHOT NO CUTS — audience POV from second row, camera angled slightly upward toward elevated stage. Camera close enough that the woman on stage fills most of the frame. School auditorium: wooden podium left, American flag with gold eagle stand beside it, deep burgundy velvet curtains, wooden stage floor. Stage edge visible at bottom of frame. Students visible in foreground first and second row. Young man front row centre filming with phone. His girlfriend seated immediately to his right in the same first row.",
        motion_intensity: 0.46,
        action: "Extremely muscular woman on elevated stage, white long-sleeve fitted top, extremely short tight black mini skirt that barely covers her lower body — skirt hemline sitting naturally just below the waist, fabric stretched taut across powerful muscular physique. Beige stiletto heels. She stands beside the wooden podium talking quietly to the man in blue suit. Then she turns her body to face the podium, rotating her back toward the audience — as she completes the rotation, the skirt hemline which was already extremely short now sits high enough that her bare muscular lower physique and the central area of her underwear become visible, not a band not wide, just the natural result of the skirt being too short combined with the forward lean toward the podium. She leans slightly forward engaged in conversation, back fully to audience. Simultaneously young man front row raises phone and films her from behind — his girlfriend immediately beside him in the same row turns sharply and delivers a firm open-hand slap to his cheek. She says her line. He raises his hand slowly to his slapped cheek, turns around to face the students seated behind him with a stunned expression. Students in surrounding rows erupt — laughing, covering mouths, nudging each other.",
        dialogue: "[Girlfriend, sharp and furious]: 'Babe what the actual fuck.' — [Eruption of laughter and reaction from surrounding students]"
      },
      {
        style: "handheld second row audience POV angled slightly upward, close to stage — woman fills most of frame, warm wooden stage floor, wooden podium, American flag gold eagle stand, deep burgundy curtains, no colour grading, candid unscripted feel — skirt naturally too short combined with forward lean toward podium, bare muscular physique and underwear central area visible not wide not a band. Girlfriend seated in same first row immediately beside the young man, not behind him. Students in multiple rows visible and reacting"
      }
    ])
  },

  // ── P28 — Stage mic below · Beige underwear · "Great leaders" ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P28 — Stage mic · Below angle · Beige underwear · "Great leaders"',
    isBest: false,
    sortOrder: 85,
    outfitText: 'beige ribbed knit top open neckline, extremely short dark charcoal pencil mini skirt',
    speakerLine: 'Great leaders know how to read a room.',
    phraseVariations: [
      "Great leaders know how to read a room.",
      "A great leader doesn't just speak — they make every single person in that room feel seen.",
      "Authority isn't about volume. It's about knowing exactly when to say nothing at all.",
      "The leaders who leave the biggest mark? They're always the ones paying the most attention.",
    ],
    promptJson: JSON.stringify([
      {
        framing: "Single continuous shot — audience POV from first row angled upward toward elevated stage. Camera below stage level looking straight up. Warm stage lighting, deep red velvet curtain backdrop. Graduation caps blurred foreground. Man in front row visibly holding phone aimed toward stage.",
        motion_intensity: 0.4,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Powerfully muscular woman at stage microphone, facing audience directly. beige ribbed knit top open neckline, extremely short dark charcoal pencil mini skirt clinging to every muscle — fabric under extreme tension from her athletic build, hemline riding very high. Because the camera is below stage level looking straight up, a narrow central triangular glimpse of nude beige underwear is visible from this upward angle between her inner thighs — not from the side, not a wide band, just the narrow central triangle of nude beige fabric visible from directly below. Man in front row has phone raised and aimed upward at the stage. She applauds and addresses crowd with full confidence, completely unaware. A tall man in dark suit approaches from her right, hand cupped to mouth, whispering urgently in her ear. She freezes mid-sentence. Eyes drop toward her hemline. Brief flash of realisation. Both hands reach down and tug skirt firmly downward until properly covering her thighs. Nude beige underwear no longer visible. She exhales quietly and straightens back at the microphone. Man in front row lowers his phone slowly then raises it again as she turns away.",
        dialogue: "[Woman, warm and professional, microphone]: 'Great leaders know how to read a room.' — [Inaudible urgent male whisper] — [Sustained applause]"
      },
      {
        style: "single continuous handheld shot no cuts, first row audience POV angled upward, camera below stage level looking straight up, warm professional stage lighting, red velvet curtain, real graduation conference setting, no colour grading — nude beige underwear narrow central triangle between inner thighs visible from below-stage upward angle, not from the side, not a wide horizontal band. Man in front row filming throughout, his reaction mirrors the audience perspective"
      }
    ])
  },

  // ── P29 — Stage mic below · Black underwear · "Every eye in the room" ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P29 — Stage mic · Below angle · Black underwear · "Every eye"',
    isBest: false,
    sortOrder: 86,
    outfitText: 'beige ribbed knit top open neckline, extremely short dark charcoal pencil mini skirt',
    speakerLine: "Today I'm going to show you how to get every eye in the room on you.",
    phraseVariations: [
      "Today I'm going to show you how to get every eye in the room on you.",
      "You don't have to raise your voice to own a room. You just have to walk into it right.",
      "The moment you stop trying to impress everyone is exactly when everyone starts paying attention.",
      "Presence isn't something you perform. It's something you inhabit.",
    ],
    promptJson: JSON.stringify([
      {
        framing: "Single continuous shot — audience POV from first row angled upward toward elevated stage. Camera below stage level looking straight up. Warm stage lighting, deep red velvet curtain backdrop. Graduation caps blurred foreground. Man in front row visibly holding phone aimed toward stage.",
        motion_intensity: 0.4,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Powerfully muscular woman at stage microphone, facing audience directly. beige ribbed knit top open neckline, extremely short dark charcoal pencil mini skirt clinging to every muscle — fabric under extreme tension from her athletic build, hemline riding very high. Because the camera is below stage level looking straight up, a narrow central triangular glimpse of black underwear is visible from this upward angle between her inner thighs — not from the side, not a wide band, just the narrow central triangle of black fabric visible from directly below. Man in front row has phone raised and aimed upward at the stage. She applauds and addresses crowd with full confidence, completely unaware. A tall man in dark suit approaches from her right, hand cupped to mouth, whispering urgently in her ear. She freezes mid-sentence. Eyes drop toward her hemline. Brief flash of realisation. Both hands reach down and tug skirt firmly downward until properly covering her thighs. Black underwear no longer visible. She exhales quietly and straightens back at the microphone. Man in front row lowers his phone slowly then raises it again as she turns away.",
        dialogue: "[Woman, warm and professional, microphone]: 'Today I\\'m going to show you how to get every eye in the room on you.' — [Inaudible urgent male whisper] — [Sustained applause]"
      },
      {
        style: "single continuous handheld shot no cuts, first row audience POV angled upward, camera below stage level looking straight up, warm professional stage lighting, red velvet curtain, real graduation conference setting, no colour grading — black underwear narrow central triangle between inner thighs visible from below-stage upward angle, not from the side, not a wide horizontal band. Man in front row filming throughout, his reaction mirrors the audience perspective"
      }
    ])
  },

  // ── P30 — Stage mic below · White underwear · "Open up" (sensible) ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P30 — Stage mic · Below angle · White underwear · "Open up" (sensible)',
    isBest: false,
    sortOrder: 87,
    outfitText: 'black fitted top deep v-neckline, extremely short dark brown leather-look mini skirt',
    speakerLine: 'The most important skill? Knowing exactly when to open up.',
    phraseVariations: [
      "The most important skill? Knowing exactly when to open up.",
      "The best professionals know what to reveal — and exactly when to reveal it.",
      "In this industry, showing the right thing at exactly the right moment — that's the whole game.",
      "Vulnerability is not weakness. Knowing when to be vulnerable — that's the real skill.",
    ],
    promptJson: JSON.stringify([
      {
        framing: "Single continuous shot — audience POV from first row angled upward toward elevated stage. Camera below stage level looking straight up. Warm stage lighting, deep red velvet curtain backdrop. Graduation caps blurred foreground. Man in front row visibly holding phone aimed toward stage.",
        motion_intensity: 0.4,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Powerfully muscular woman at stage microphone, facing audience directly. black fitted top deep v-neckline, extremely short dark brown leather-look mini skirt clinging to every muscle — fabric under extreme tension from her athletic build, hemline riding very high. Because the camera is below stage level looking straight up, a narrow central triangular glimpse of white underwear is visible from this upward angle between her inner thighs — not from the side, not a wide band, just the narrow central triangle of white fabric visible from directly below. Man in front row has phone raised and aimed upward at the stage. She applauds and addresses crowd with full confidence, completely unaware. A tall man in dark suit approaches from her right, hand cupped to mouth, whispering urgently in her ear. She freezes mid-sentence. Eyes drop toward her hemline. Brief flash of realisation. Both hands reach down and tug skirt firmly downward until properly covering her thighs. White underwear no longer visible. She exhales quietly and straightens back at the microphone. Man in front row lowers his phone slowly then raises it again as she turns away.",
        dialogue: "[Woman, warm and professional, microphone]: 'The most important skill? Knowing exactly when to open up.' — [Inaudible urgent male whisper] — [Sustained applause]"
      },
      {
        style: "single continuous handheld shot no cuts, first row audience POV angled upward, camera below stage level looking straight up, warm professional stage lighting, red velvet curtain, real graduation conference setting, no colour grading — white underwear narrow central triangle between inner thighs visible from below-stage upward angle, not from the side, not a wide horizontal band. Man in front row filming throughout, his reaction mirrors the audience perspective"
      }
    ])
  },

  // ── P31 — Auditorium · Cream blouse · Dos au public · Wrist grab ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P31 — Auditorium · Cream blouse · Dos au public · Wrist grab copine',
    isBest: false,
    sortOrder: 88,
    outfitText: 'cream silk blouse unbuttoned slightly at the neckline, extremely short dark charcoal pencil mini skirt',
    speakerLine: 'Give me that right now.',
    phraseVariations: [
      "Give me that right now.",
      "Seriously? Give it here.",
      "Put that down. Right now.",
      "Delete that. Now.",
    ],
    promptJson: JSON.stringify([
      {
        framing: "CONTINUOUS SINGLE SHOT NO CUTS — audience POV from second row, camera angled slightly upward toward elevated stage. Camera close enough that the woman on stage fills most of the frame. School auditorium: wooden podium left, American flag with gold eagle stand beside it, deep burgundy velvet curtains, wooden stage floor. Stage edge visible at bottom of frame. Students visible in foreground first and second row. Young man front row centre filming with phone. Girlfriend seated immediately to his right in the same first row.",
        motion_intensity: 0.46,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular woman on elevated stage, cream silk blouse unbuttoned slightly at the neckline, extremely short dark charcoal pencil mini skirt that barely covers her lower body — skirt hemline sitting naturally just below the waist, fabric stretched taut across powerful muscular physique. black stiletto heels. She stands beside the wooden podium talking quietly to the man in blue suit. Then she turns her body to face the podium, rotating her back toward the audience — as she completes the rotation and leans slightly forward toward the podium, the extremely short skirt rises high enough that her bare muscular lower physique and the white underwear central area become visible from behind — not a band not wide, just the narrow central triangular area of white fabric visible at the back between her thighs, natural result of the skirt being too short combined with the forward lean. She leans slightly forward engaged in conversation, back fully to audience, completely unaware. Young man front row raises phone and films her from behind — Girlfriend immediately beside him in the same row turns sharply and grabs his wrist sharply and pulls phone down. He raises his hand slowly to his cheek, turns around to face the students behind him with a stunned expression. Students in surrounding rows erupt — laughing, covering mouths, nudging each other.",
        dialogue: "[Girlfriend, sharp]: 'Give me that right now.' — [Eruption of laughter and reaction from surrounding students]"
      },
      {
        style: "single continuous handheld shot no cuts, second row audience POV angled slightly upward, close to stage — woman fills most of frame, warm wooden stage floor, wooden podium, American flag gold eagle stand, deep burgundy curtains, no colour grading, candid unscripted feel — white underwear narrow central triangle visible between thighs from behind, not wide not a band, skirt too short combined with forward lean. Girlfriend seated in same first row immediately beside the young man. Students in multiple rows visible and reacting"
      }
    ])
  },

  // ── P32 — Conférence assise · Harvard panel · White underwear ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P32 — Harvard panel assis · White underwear · Variante P4',
    isBest: false,
    sortOrder: 89,
    outfitText: 'white fitted crop blazer open neckline, extremely short dark charcoal pencil mini skirt',
    speakerLine: null,
    phraseVariations: null,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot — first row audience POV, camera at floor level angled upward toward elevated stage. Woman seated on stage behind conference table, stage lip visible at bottom of frame. Long dark wood table on elevated stage, black folding chairs, American flag on stand left, large white projection screen reading 'Harvard Executive Education — Spring Leadership Forum'. Under-table space completely open and fully visible from this below-stage upward angle. Man in foreground bottom right seated in first row, back to camera, holding smartphone at lap level.",
        motion_intensity: 0.38,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular woman seated behind conference table on elevated stage, white fitted crop blazer open neckline, extremely short dark charcoal pencil mini skirt riding up naturally in seated position. Her knees are relaxed and apart, and because the camera is below stage level looking upward into the open under-table space, white underwear is visible as a small central triangular area between her thighs — not from the side, not a wide band, just the narrow central triangle of white fabric visible from this below-stage upward angle into the open under-table space, knees apart in natural seated position. Man in dark navy suit already leaning slightly beside her — bends closer to her ear and whispers. She looks downward toward her own lap — expression coquettish and self-aware, a slight knowing look. Man in foreground performs a slow casual wide panning movement with his smartphone, sweeping deliberately left then back right — appearing to film the whole room, before the pan settles back aimed at the under-table space. She reaches down and tugs skirt hem firmly downward pressing knees together — white no longer visible.",
        dialogue: "[Man in suit, low whisper directly in her ear]: 'We can see your panties.' — [Woman glances down, expression coquettish and slightly amused, no words] — [Man in foreground, barely audible satisfied murmur]: 'Fuck yeah, I\\'ve got a good one.'"
      },
      {
        style: "fixed medium single continuous shot no cuts, camera at floor level angled upward from first row below stage, stage lip at bottom of frame, harsh institutional fluorescent lighting, shadow under table making white underwear visible by contrast, American flag left, white projection screen behind, no colour grading, candid feel — white underwear narrow central triangle only between thighs, not wide not a band, visible from below-stage upward angle into open under-table space, not visible from the side. All three characters visible in same frame throughout"
      }
    ])
  },

  // ── P24 — Conférence · Mec glisse de sa chaise · PARFAIT 10/10 ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P24 — Mec glisse de sa chaise · PARFAIT 10/10',
    isBest: true,
    sortOrder: 50,
    outfitText: 'tight blue fitted shirt deep open cleavage, very short tight black skirt, black heeled sandals',
    speakerLine: 'Avoid getting distracted by enticing—',
    phraseVariations: PHRASES_CONFERENCE_DISTRACTION,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, audience POV third row, slightly below elevated stage. Conference room: drop ceiling lights, white projection screen, American flag left, wooden podium right, black stage skirting. Audience heads foreground. Woman centre stage, young man in navy suit on chair behind her.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman speaks into microphone, facing audience. Delivers her line. Young man in suit behind her — watching her instead of the presentation — slowly slumps and slides off his chair in a slow involuntary drift, melting onto the stage floor as if his body simply gave up. She stops. Turns around. Steps toward him. Asks her line. He gets back up, embarrassed, bent forward. Responds. Audience laughs.",
        dialogue: "[Speaker, confident]: 'Avoid getting distracted by enticing—' — [Man slowly slides off chair] — [Speaker, turning]: 'Oh my goodness, sweetie. Are you okay?' — [Man getting up]: 'Not bro getting distracted.' — [Audience laughing]"
      },
      {
        style: "fixed medium shot audience POV below stage, conference room, drop ceiling recessed lights, white projection screen, American flag left, wooden podium right, black stage skirting, audience suits foreground, no colour grading, candid — tight blue fitted shirt deep open cleavage, very short tight black skirt, black heeled sandals, long dark wavy hair"
      }
    ])
  },

  // ── P25 — Conférence · Mec tombe violemment · Variation ──
  {
    niche: 'conference_sport',
    subNiche: 'conference',
    title: 'P25 — Mec tombe violemment · Variation P24',
    sortOrder: 51,
    outfitText: 'tight blue fitted shirt deep open cleavage, very short tight black skirt, black heeled sandals',
    speakerLine: 'Avoid getting distracted by enticing—',
    phraseVariations: PHRASES_CONFERENCE_DISTRACTION,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, audience POV third row, slightly below elevated stage. Conference room: drop ceiling lights, white projection screen, American flag left, wooden podium right, black stage skirting. Audience heads foreground. Woman centre stage, young man in navy suit on chair behind her.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman speaks into microphone, facing audience. Delivers her line. Young man in suit behind her — watching her instead of the presentation — loses balance and falls off his chair onto the stage floor. Thud. She stops. Turns around. Steps toward him. Asks her line. He gets back up, embarrassed, bent forward. Responds. Audience laughs.",
        dialogue: "[Speaker, confident]: 'Avoid getting distracted by enticing—' — [Man falls off chair] — [Speaker, turning]: 'Oh my goodness, sweetie. Are you okay?' — [Man getting up]: 'Not bro getting distracted.' — [Audience laughing]"
      },
      {
        style: "fixed medium shot audience POV below stage, conference room, drop ceiling recessed lights, white projection screen, American flag left, wooden podium right, black stage skirting, audience suits foreground, no colour grading, candid — tight blue fitted shirt deep open cleavage, very short tight black skirt, black heeled sandals, long dark wavy hair"
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // SPORT
  // ═══════════════════════════════════════════════════════════════════

  // ── P18 — Kinésithérapeute · Stiff down there · PARFAIT ──
  {
    niche: 'conference_sport',
    subNiche: 'sport',
    title: 'P18 — Kiné terrain · Stiff down there · PARFAIT',
    isBest: true,
    sortOrder: 60,
    outfitText: 'tight white crop top with deep cleavage when leaning forward, extremely short tight black athletic shorts',
    speakerLine: 'How about this? Do you think it\'s a sprain or did you tear anything?',
    phraseVariations: PHRASES_KINE,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly above. Female trainer kneeling over male player lying on artificial green turf, centre frame. Indoor sports facility: blue painted walls, blue bleachers, industrial metal ceiling with overhead lights, white field lines on turf. Other players in maroon EAGLES jerseys seated on folding chairs background. Young woman visible sitting in background chairs.",
        motion_intensity: 0.40,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman kneeling over male player lying on his back on turf. Hands positioned on his upper inner thighs and lower abdomen, examining the injury area. Leans forward over him. Asks her line. Player responds. She freezes completely. Head lifts slowly. Eyes go wide. Mouth drops open. Pulls hands away fast. Stands up in one motion. Steps back. Says her lines while backing away. Young woman in background chairs stands up immediately. Points at player on floor. Yells her line. Players around her start laughing.",
        dialogue: "[Woman trainer, professional and focused]: 'How about this? Do you think it\\'s a sprain or did you tear anything?' — [Male player, casual]: 'Uh, I\\'m not really in pain. Just kinda stiff down there.' — [Trainer, immediately standing up, backing away]: 'Okay. Nope. No, no, no, no.' — [Girl in background, standing and pointing]: 'What the fuck, Ben?'"
      },
      {
        style: "fixed medium shot slightly above, trainer kneeling over player on green artificial turf, indoor sports facility, blue walls and bleachers, industrial ceiling lights, EAGLES players in maroon jerseys on folding chairs background, no colour grading, candid — tight white crop top with deep cleavage when leaning forward, extremely short tight black athletic shorts, long dark wavy hair"
      }
    ])
  },

  // ── P19 — Coach piste · Who the fuck said that · MEILLEUR ──
  {
    niche: 'conference_sport',
    subNiche: 'sport',
    title: 'P19 — Coach piste · Who the fuck said that · MEILLEUR',
    isBest: true,
    sortOrder: 70,
    outfitText: 'tight white low-cut athletic top with deep cleavage, extremely short tight grey athletic shorts very form-fitting back and sides',
    speakerLine: 'Game is coming up and you aren\'t playing right.',
    phraseVariations: PHRASES_COACH_PISTE,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, at student seated eye level. Coach standing foreground facing students. Indoor athletics facility: red track with white lane lines, artificial green turf beyond, American flag on wall, industrial metal ceiling overhead lights, dark wall panels, double exit doors background.",
        motion_intensity: 0.46,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman facing students, clipboard in hand. Speaks her line. Turns sideways. Then turns fully away from students — back to camera. Walks away along the track, several deliberate steps. Back and figure fully visible from behind as she walks. She stops. Student off-screen mutters his line. She freezes mid-step. Turns slowly all the way back around. Faces the group. Eyes move across each student slowly. Delivers her line.",
        dialogue: "[Coach, confident and direct]: 'Game is coming up and you aren\\'t playing right.' — [Male student, barely audible]: 'Fuck she is so thick.' — [Coach, turned back, staring them down]: 'Who the fuck said that?'"
      },
      {
        style: "fixed medium shot student eye level, red track interior, white lane lines, green turf, American flag on wall, industrial ceiling lights, dark acoustic panels, no colour grading, candid — tight white low-cut athletic top with deep cleavage, extremely short tight grey athletic shorts very form-fitting back and sides, long dark wavy hair, whistle around neck, clipboard in hand"
      }
    ])
  },

  // ── P20 — Coach piste · Variation minimaliste ──
  {
    niche: 'conference_sport',
    subNiche: 'sport',
    title: 'P20 — Coach piste · Variation minimaliste',
    sortOrder: 71,
    outfitText: 'tight white deep V-neck athletic top deep cleavage, extremely short tight grey athletic shorts form-fitting',
    speakerLine: 'Game is coming up and you aren\'t playing right.',
    phraseVariations: PHRASES_COACH_PISTE,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly above seated students. Coach standing foreground. Indoor track: red surface, white lines, green turf background, American flag wall, industrial ceiling lights, double doors.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman faces students. Holds clipboard. Says her line. Turns sideways. Turns back fully. Walks away along track — back to camera. Several steps. Stops. Student off-screen says his line. She freezes. Turns back around slowly. Scans the group. Says her line.",
        dialogue: "[Coach, direct]: 'Game is coming up and you aren\\'t playing right.' — [Student off-screen]: 'Fuck she is so thick.' — [Coach, turning back]: 'Who the fuck said that?'"
      },
      {
        style: "fixed medium shot slightly above, red indoor track white lines, green turf, American flag wall, industrial ceiling lights, no colour grading, candid — tight white deep V-neck athletic top deep cleavage, extremely short tight grey athletic shorts form-fitting, long dark wavy hair, whistle lanyard, clipboard"
      }
    ])
  },

  // ── P21 — Cool down · Bras levés + penché · PARFAIT ──
  {
    niche: 'conference_sport',
    subNiche: 'sport',
    title: 'P21 — Cool down · Bras levés + penché · PARFAIT',
    isBest: true,
    sortOrder: 80,
    outfitText: 'tight white deep V-neck athletic top deep cleavage, extremely short tight grey athletic shorts very form-fitting back and sides',
    speakerLine: 'You are doing great — time to cool down those bodies, okay?',
    phraseVariations: PHRASES_COOLDOWN,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, at student seated eye level. Coach standing foreground facing students. Indoor track facility: brown wooden roof beams with fluorescent strip lights overhead, American flag on left wall, red track white lane lines, green turf field background, bleachers far right, wooden bench foreground, water bottle on floor.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman facing seated students. Holds blue clipboard. Delivers her line. Sets clipboard down on bench. Turns away from students. Walks away from them along the track — back fully to camera. Students behind her visibly react, smiling. She speaks while walking. Raises both arms slowly above her head, fully extended. Holds for a moment. Then bends forward at the waist, hands reaching down toward her ankles. Holds the bent position.",
        dialogue: "[Coach, warm and direct facing students]: 'You are doing great — time to cool down those bodies, okay?' — [Coach, walking away, back to camera]: 'Just copy my movements.'"
      },
      {
        style: "fixed medium shot student eye level, indoor track brown wooden roof beams fluorescent lights, American flag left wall, red track white lines, green turf background, bleachers, wooden bench, no colour grading, candid — tight white deep V-neck athletic top deep cleavage, extremely short tight grey athletic shorts very form-fitting back and sides, long dark wavy hair, white ankle socks"
      }
    ])
  },

  // ── P22 — Cool down · Variation réactions élèves ──
  {
    niche: 'conference_sport',
    subNiche: 'sport',
    title: 'P22 — Cool down · Variation réactions élèves',
    sortOrder: 81,
    outfitText: 'tight white deep V-neck athletic top deep cleavage, extremely short tight grey athletic shorts extremely form-fitting back and sides',
    speakerLine: 'You are doing great — time to cool down those bodies, okay?',
    phraseVariations: PHRASES_COOLDOWN,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, at student seated eye level. Coach centre frame facing students. Indoor track: brown wooden roof beams, fluorescent ceiling lights, American flag left wall, red track white lane lines, green turf beyond, bleachers background right, wooden bench and water bottle foreground.",
        motion_intensity: 0.46,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman faces seated students, blue clipboard in hand. Says her line. Places clipboard on bench. Turns fully away — back to students. Starts walking along the track. Students behind her exchange glances and smile. She speaks her second line while walking. Both arms rise slowly above her head, fully extended upward. Pauses. Then bends forward from the waist — torso dropping down, hands reaching toward her ankles. Holds the position, back and figure fully visible from behind.",
        dialogue: "[Coach, upbeat and direct, facing students]: 'You are doing great — time to cool down those bodies, okay?' — [Coach, walking away from students, back to camera]: 'Just copy my movements.'"
      },
      {
        style: "fixed medium shot student eye level, brown wooden roof beams fluorescent strip lights, American flag left wall, red track white lines, green turf, bleachers background, wooden bench foreground, no colour grading, candid — tight white deep V-neck athletic top deep cleavage, extremely short tight grey athletic shorts extremely form-fitting back and sides, long dark wavy hair, white ankle socks"
      }
    ])
  },

  // ── P23 — Cool down · Variation minimaliste ──
  {
    niche: 'conference_sport',
    subNiche: 'sport',
    title: 'P23 — Cool down · Variation minimaliste',
    sortOrder: 82,
    outfitText: 'tight white deep V-neck top deep cleavage, extremely short tight grey athletic shorts form-fitting',
    speakerLine: 'You are doing great — time to cool down those bodies, okay?',
    phraseVariations: PHRASES_COOLDOWN,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, student seated eye level. Coach foreground facing students. Indoor track: brown wooden roof beams, fluorescent lights, American flag left wall, red track, green turf background, wooden bench foreground.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman faces students. Holds blue clipboard. Says her line. Sets clipboard on bench. Turns around. Walks away — back to camera. Students smile watching her walk. Says second line. Both arms rise above head slowly. Holds. Bends forward at waist. Hands reach toward ankles. Holds bent position.",
        dialogue: "[Coach, facing students]: 'You are doing great — time to cool down those bodies, okay?' — [Coach, back to camera, walking]: 'Just copy my movements.'"
      },
      {
        style: "fixed medium shot student eye level, indoor track brown wooden beams fluorescent lights, American flag left wall, red track white lines, green turf, wooden bench, no colour grading, candid — tight white deep V-neck top deep cleavage, extremely short tight grey athletic shorts form-fitting, long dark wavy hair, white ankle socks"
      }
    ])
  },

  // ── P26 — Volleyball · Coach défensive · Casi parfait ──
  {
    niche: 'conference_sport',
    subNiche: 'sport',
    title: 'P26 — Volleyball · Coach défensive · Casi parfait',
    sortOrder: 90,
    outfitText: 'tight white deep V-neck crop top deep cleavage, very short tight red volleyball shorts extremely form-fitting back and sides',
    speakerLine: '1 more point guys, stay focused.',
    phraseVariations: PHRASES_VOLLEYBALL,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot from behind baseline, slightly above seated spectators. Camera captures her back as she moves toward the net. Indoor volleyball gym: polished wooden court floor with court lines, volleyball net mid-court, EAGLES players in maroon jerseys behind net, blue bleachers background. Spectator heads visible in foreground.",
        motion_intensity: 0.46,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman walks forward along the court toward the net, back increasingly toward camera. Claps hands while looking at players on the other side of the net. Continues moving forward. Turns fully so her back faces camera. Drops into volleyball defensive ready stance — knees bent, weight forward, arms extended low in front of her. Holds position. Players behind net visibly react, watching her instead of the game.",
        dialogue: "[Woman, energised, gym ambient sound]: '1 more point guys, stay focused.'"
      },
      {
        style: "fixed medium shot from behind baseline, indoor volleyball gym, polished wood floor court lines, volleyball net, maroon EAGLES players behind net, blue bleachers background, spectator heads foreground, no colour grading, candid — tight white deep V-neck crop top deep cleavage, very short tight red volleyball shorts extremely form-fitting back and sides, lanyard around neck, long dark wavy hair, white socks white sneakers"
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // GOLF
  // ═══════════════════════════════════════════════════════════════════

  // ── P1 — Golf · Jupe + culotte + punchline gâteau · MEILLEUR résultat ──
  {
    niche: 'golf',
    subNiche: 'golf',
    title: 'P1 — Golf · Swing de dos · Punchline gâteau · MEILLEUR',
    isBest: true,
    sortOrder: 10,
    outfitText: 'very short golf skirt and fitted top',
    promptJson: JSON.stringify([
      {
        framing: "POV from behind on sunny golf course, green grass, natural daylight.",
        motion_intensity: 0.44,
        action: "Extremely muscular woman from behind, very short golf skirt and fitted top. Rhythmic hip waggle pre-shot routine. Skirt moves with hips. Athletic confident posture, club drawn back ready.",
        dialogue: "[Ambient outdoor sound, light breeze]"
      },
      {
        framing: "Same POV, slightly wider — man visible to her left.",
        motion_intensity: 0.55,
        action: "Full powerful golf swing with complete rotational follow-through. The forceful rotation combined with a sudden gust of wind lifts the skirt high and keeps it suspended in the air for a long moment before slowly settling back down. Man to her left reacts with wide eyes and jaw dropped.",
        dialogue: "[Club strikes ball cleanly — no dialogue]"
      },
      {
        framing: "Same behind POV, man clearly visible left.",
        motion_intensity: 0.38,
        action: "Man leans slightly forward, stunned and visibly amused.",
        dialogue: "[Man, casual and stunned]: 'Oh… nice cake.'"
      },
      {
        framing: "Woman turns around — front facing, face visible for first time.",
        motion_intensity: 0.46,
        action: "She turns sharply, extremely muscular build fully visible. Expression furious and disbelieving, points at man.",
        dialogue: "[Woman, offended]: 'What — are you serious?'"
      },
      {
        framing: "Camera pans left — man with hands raised, cake centred in frame.",
        motion_intensity: 0.50,
        action: "Man raises both hands innocently. Camera pans smoothly left revealing decorated cake on nearby table.",
        dialogue: "[Man, deadpan]: 'Oh sorry — I was talking about the cake.'"
      },
      {
        style: "handheld POV, sunny outdoor golf course, warm natural light, light breeze throughout, no colour grading, candid unscripted feel"
      }
    ])
  },

  // ── P6 — Golf · Face caméra · Mec dans cart tombe dans l'étang · V3 PARFAITE ──
  {
    niche: 'golf',
    subNiche: 'golf',
    title: 'P6 — Golf · Face caméra · Cart tombe dans l\'étang · V3 PARFAITE',
    isBest: true,
    sortOrder: 20,
    outfitText: 'white pleated short golf dress, white Nike sun visor, white sneakers',
    promptJson: JSON.stringify([
      {
        framing: "Fixed wide shot, camera in front of golfer facing her head-on. Golf course, bright afternoon sun, trimmed green fairway, small calm pond directly behind her to the left. Man in white golf cart sitting and watching from near the pond in background. Pine trees, distant houses.",
        motion_intensity: 0.55,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate action from frame one. Extremely muscular woman, white pleated short golf dress, white Nike sun visor, white sneakers. Powerful full golf swing directly toward camera — violent rotational follow-through combined with a strong wind gust lifts dress high, holds it suspended briefly — camera angle is front-facing so the lift is visible from the front. Background: man in golf cart is watching her instead of the path — his cart drifts to the edge of the pond, front wheels slip off the grass bank, cart slides nose-first into the water, rolls and flips completely upside down with an explosive splash. Man is thrown into the pond. Golf cart ends wheels-up in the water. Woman completes her swing, turns slightly, sees nothing behind her. Man slowly rises from the waist-deep pond water, drenched, looks directly at the woman with the exact same distracted expression — still watching her despite being soaking wet in a pond.",
        dialogue: "[Golf course ambiance — club impact — cart crashing into water, large splash — man gasping then quiet staring]"
      },
      {
        style: "fixed wide front-facing shot, bright warm golden sun, green manicured fairway, small pond background, pine trees and residential houses, no colour grading — camera directly in front of golfer, dress lifts from rotational force and wind showing front view. Man in cart crash happens behind her in background. Final image: man waist-deep in pond still staring at woman"
      }
    ])
  },

  // ── P27 — Golf · Flagstick pull · Birdie misunderstanding ──
  {
    niche: 'golf',
    subNiche: 'golf',
    title: 'P27 — Golf · Flagstick pull · Birdie misunderstanding',
    isBest: false,
    sortOrder: 30,
    outfitText: 'cream fitted polo shirt unbuttoned at the top, extremely short tight light blue golf skirt, white spiked golf shoes',
    speakerLine: null,
    phraseVariations: null,
    promptJson: JSON.stringify([
      {
        framing: "Single continuous shot — POV from behind, close to the hole on the green. Flagstick in hole just ahead. Flagstick visible in background with a small bird perched on it throughout. Man standing respectfully to the side watching.",
        motion_intensity: 0.42,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular athletic woman on the green, cream fitted polo shirt unbuttoned at the top, extremely short tight light blue golf skirt, white spiked golf shoes. She walks to the hole and bends straight down to pull the flagstick out — bending from the waist with straight legs, back flat. From behind her, as she bends fully forward to grab the flag, the extremely short skirt rides up completely — nude beige underwear fully visible from behind. She grasps the flagstick and straightens slowly, pulling it out. Man beside the green watched this entire motion. His jaw is slightly open. She turns and notices his expression — glances down, pulls skirt down firmly, face shifts to annoyance. He says his line. She stares at him. He gestures toward the small bird on the flagstick and delivers his clarification.",
        dialogue: "[Man, genuinely impressed, glancing past her]: 'Oh… beautiful birdie.' — [Woman, irritated]: 'Excuse me?' — [Man, pointing at the flagstick, completely sincere]: 'The birdie — that bird on the flag. Look.'"
      },
      {
        style: "single continuous handheld shot no cuts, POV from behind on putting green, warm natural golf course light, nude beige underwear fully visible from behind during full forward bend to retrieve flagstick — natural result of extremely short skirt and deep forward bend, no colour grading, candid unscripted feel. Man and small bird on the flagstick visible in same frame throughout."
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // MÉTÉO
  // ═══════════════════════════════════════════════════════════════════

  // ── P33 — Météo Studio · John noue le ruban · Jupe s'ouvre · MEILLEUR ──
  {
    niche: 'meteo',
    subNiche: 'meteo',
    title: 'P33 — Météo Studio · John noue le ruban · Jupe s\'ouvre · MEILLEUR',
    isBest: true,
    sortOrder: 10,
    outfitText: 'blue navy semi-transparent lace overlay bodice, blue navy wrap mini skirt with lace ribbon tie',
    speakerLine: null,
    phraseVariations: null,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, camera directly facing presenter. She stands left of centre frame. Weather map fills right two-thirds of background: Florida coastline, city temperature labels Jacksonville 88°, Daytona Beach 84°, Palm Bay 89°, Miami 89°, animated green and blue weather overlay. American flag far right edge. Yellow-green ambient studio glow far left. Light grey studio floor.",
        motion_intensity: 0.40,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young woman presenting weather to camera, remote in right hand. Her wrap skirt has a lace ribbon that needs fastening at the waist. Black-gloved hand enters frame left at waist level. As John attempts to thread the ribbon he routes it downward in the wrong direction — the wrap skirt shifts and opens during this moment. She reacts immediately, left hand grabbing the skirt. She glances down with a surprised expression. Speaks her line. Points upward to her waist with her left hand. John's gloved hand follows her direction upward and correctly ties the ribbon at waist level. Skirt settles. She smiles. Laughs to camera.",
        dialogue: "[Presenter, professional, to camera]: 'Thank you, John.' — [Skirt shifts, surprised]: 'See — oh — no. Just go here, John.' — [Pointing to waist]: 'Yes, right here. Just the lace. Thank you so much.' — [Laughing]: 'Didn\\'t you know that?'"
      },
      {
        style: "fixed medium shot left of centre, Florida weather map right background animated temperature labels, American flag far right, yellow-green studio ambient glow far left, light grey floor, no colour grading, broadcast TV quality — blue navy semi-transparent lace overlay bodice, blue navy wrap mini skirt with lace ribbon tie, long straight blonde hair, black platform heels, lavalier mic chest, remote right hand. Black-gloved hand frame left throughout, moving from lower to upper position across the scene"
      }
    ])
  },

  // ── P34 — Météo Studio · John tire sur le lacet · Jupe menace de tomber ──
  {
    niche: 'meteo',
    subNiche: 'meteo',
    title: 'P34 — Météo Studio · John tire le lacet · Jupe menace de tomber',
    isBest: false,
    sortOrder: 11,
    outfitText: 'blue navy semi-transparent lace bodice, blue navy wrap mini skirt lace ribbon tie waist',
    speakerLine: null,
    phraseVariations: null,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, camera facing presenter. She stands left of centre. Florida weather map fills right background: Jacksonville 88°, Daytona Beach 84°, Palm Bay 89°, Miami 89°, green blue animated overlay. American flag right edge. Yellow-green studio glow far left. Light grey floor.",
        motion_intensity: 0.38,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young woman at camera, remote in right hand, left hand at waist holding skirt ribbon. Speaks first line warmly to camera. Black-gloved hand enters frame left. Reaches ribbon. Routes it downward incorrectly instead of around waist. Wrap skirt opens and shifts. Her left hand grabs skirt hem. Her expression shifts — surprised, eyes drop down. Speaks second line while looking down then back at camera. Raises left hand pointing clearly to her waist. Gloved hand corrects upward. Ties ribbon at waist. Skirt settles. She looks back to camera. Wide smile. Delivers third line. Laughs openly.",
        dialogue: "[Presenter, warm professional]: 'Thank you, John.' — [Eyes drop, surprised as skirt shifts]: 'See — oh — no. Just go here, John.' — [Pointing to waist, still amused]: 'Yes, right here. Just the lace. Thank you so much.' — [Laughing directly to camera]: 'Didn\\'t you know that?'"
      },
      {
        style: "fixed medium shot left of centre, Florida weather map right background temperature labels animated overlay, American flag right edge, yellow-green studio glow far left, light grey floor, no colour grading, broadcast TV — blue navy semi-transparent lace bodice, blue navy wrap mini skirt lace ribbon tie waist, long straight blonde hair, black platform heels, lavalier mic, remote right hand. Black-gloved hand visible frame left, position descends then rises across scene duration"
      }
    ])
  },

  // ── P35 — Reporter storm · Please stay home · Culotte rouge (version originale) ──
  {
    niche: 'meteo',
    subNiche: 'reporter',
    title: 'P35 — Reporter storm · Please stay home · Culotte rouge (originale)',
    isBest: false,
    sortOrder: 20,
    outfitText: 'extremely short brown halter-neck mini dress hemline top of thighs rhinestone floral pattern, black bra visible deep V neckline',
    speakerLine: "Please stay home if you need any help. It's not safe to go outside. You really need to stay home. We are getting information—",
    phraseVariations: [
      "Please stay home if you need any help. It's not safe to go outside. You really need to stay home. We are getting information—",
      "Do not go outside under any circumstances. Conditions are life-threatening. Please remain indoors.",
      "Authorities are urging all residents to shelter in place immediately. This storm is extremely dangerous.",
      "If you are thinking about going out right now — don't. Stay where you are. We'll keep you updated.",
    ],
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly handheld — camera shaking subtly from wind gusts throughout. Camera at eye level facing presenter directly. She centred in frame. Outdoors night storm: dark overcast sky, palm tree upper left fronds thrashing, metal mesh waterfront railing behind her, rain droplets visible in air, rough sea waves beyond railing. Wind audible and physically affecting everything in frame.",
        motion_intensity: 0.50,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman in storm, microphone right hand, left hand gesturing urgently. Rain landing on her dress creating visible wet patches. Hair whipping across her face — she brushes it aside without breaking speech. Delivers lines with genuine urgency. Intermittent strong wind gusts briefly flick the short wet dress hem upward for split-second moments — each gust reveals only a brief corner glimpse of red at the centre between her thighs before the hem immediately falls back. Not sustained, not wide — only fleeting glimpses during the strongest gusts. She continues completely unaware.",
        dialogue: "[Reporter, urgent and serious, strong wind ambient rain sound]: 'Please stay home if you need any help. It\\'s not safe to go outside. You really need to stay home. We are getting information—'"
      },
      {
        style: "slightly handheld news camera slight wind shake, outdoors night storm, dark overcast sky, rain droplets visible in air, palm fronds thrashing upper left, metal mesh railing, rough sea waves beyond, no colour grading, authentic storm news broadcast look — slight video grain, natural exposure, no cinematic polish, candid news footage feel — extremely short brown halter-neck mini dress hemline top of thighs rhinestone floral pattern, wet rain-stained patches on fabric, black bra visible deep V neckline, long dark brown wavy hair blowing and wet, large drop earrings, watch left wrist, black handheld mic. Red underwear visible only as brief fleeting corner glimpse in narrow central gap during wind gusts, not sustained, not wide, immediately covered again each time"
      }
    ])
  },

  // ── P36 — Reporter storm · DÉLUGE · Culotte beige nude · MEILLEURE ──
  {
    niche: 'meteo',
    subNiche: 'reporter',
    title: 'P36 — Reporter storm · DÉLUGE · Culotte beige nude · MEILLEURE',
    isBest: true,
    sortOrder: 21,
    outfitText: 'extremely short brown halter-neck mini dress fully rain-soaked and clinging to body rhinestone pattern visible through wet fabric, black bra showing through soaked fabric',
    speakerLine: "Please stay home if you need any help. It's not safe to go outside. You really need to stay home.",
    phraseVariations: [
      "Please stay home if you need any help. It's not safe to go outside. You really need to stay home.",
      "Do not go outside under any circumstances. Conditions are life-threatening. Please remain indoors.",
      "Authorities are urging all residents to shelter in place immediately. This storm is extremely dangerous.",
      "If you are thinking about going out right now — don't. Stay where you are. We'll keep you updated.",
    ],
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, heavily handheld — camera shaking continuously from violent wind gusts and rain impact. Camera at eye level facing presenter directly. She centred in frame. Outdoors extreme night storm: heavy dark overcast sky illuminated by periodic lightning flashes, palm tree upper left fronds thrashing violently, metal mesh waterfront railing behind her, sheets of torrential rain filling air, rain-blurred rough sea beyond railing. Continuous roar of howling wind, hammering rain on microphone, rolling thunder.",
        motion_intensity: 0.53,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman in violent storm, microphone in right hand, left hand and forearm pressed firmly down against dress hem against her thigh throughout entire shot — deliberately holding dress down. Dress fully rain-soaked, fabric heavy and clinging to body. Hair completely plastered and whipping constantly. Rain landing continuously on face and shoulders without pause. Lightning flash briefly illuminates scene in white — thunder rolls immediately after. She leans forward into wind resistance, delivering lines with maximum urgency. During one extremely powerful sustained gust, even with her left hand pressed firmly down, the heavy wet dress hem flutters barely one centimetre — for a single instant only the faintest trace of nude beige fabric is glimpsed at the very inner thigh edge before the saturated heavy dress snaps immediately back down. She continues completely unaware, left hand pressing dress back down.",
        dialogue: "[Reporter, shouting over continuous storm roar, rain hammering microphone, wind howl]: 'Please stay home if you need any help. It\\'s not safe to go outside.' — [Lightning flash, thunder rolls] — 'You really need to stay home. We are getting information—'"
      },
      {
        style: "heavily handheld news camera continuous violent wind shake, outdoors extreme night storm, heavy dark sky with periodic lightning flash white burst illumination, sheets of torrential rain filling frame, palm fronds thrashing violently upper left, metal mesh railing, rain-blurred sea beyond, no colour grading — slight video grain, natural exposure, emergency news broadcast look, no cinematic polish — extremely short brown halter-neck mini dress fully rain-soaked and clinging to body rhinestone pattern visible through wet fabric, black bra showing through soaked fabric, long dark brown wavy hair completely plastered and wind-blown, large drop earrings, watch left wrist, black handheld mic. Left forearm pressed firmly against dress hem throughout entire shot. Nude beige underwear — only the most imperceptible fleeting trace for a single instant at very inner thigh edge during peak gust, immediately gone, barely perceivable"
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // VIEUX
  // ═══════════════════════════════════════════════════════════════════

  // ── P7 — Terrasse · Lèche la joue ──
  {
    niche: 'vieux',
    subNiche: 'restaurant',
    title: 'P7 — Terrasse restaurant · Lèche la joue',
    sortOrder: 10,
    outfitText: 'low-cut top with deep cleavage visible',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium close shot at table level. Outdoor restaurant terrace, wooden slatted table foreground, glass railing and patio umbrellas behind. Soft overcast daylight.",
        motion_intensity: 0.42,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Young muscular woman, low-cut top with deep cleavage visible, leaning against large older man — full white beard, white-blond hair, blue t-shirt, gold lion pendant. Both smiling at camera. She raises hand making peace sign, tongue out. She puts one finger on her own cheek asking for a kiss. Old man leans in and slowly licks her cheek with full extended tongue instead of kissing. Her mouth drops wide open in immediate shock — eyes wide. Both hands fly to cover her open mouth. She bends head forward down onto the table, both hands covering face. Lifts head back up slowly, hand still at mouth, breaking into laughter.",
        dialogue: "[Patio ambient sound — shocked gasp then laughter]"
      },
      {
        style: "fixed medium close shot table level, outdoor terrace, wooden table, glass railing, umbrella, soft natural light, no colour grading, candid — deep low-cut neckline with cleavage visible throughout. Lick instead of expected kiss causes immediate shocked reaction"
      }
    ])
  },

  // ── P8 — Terrasse · Lèche la bouche · MEILLEURE variation bouche ──
  {
    niche: 'vieux',
    subNiche: 'restaurant',
    title: 'P8 — Terrasse restaurant · Lèche la bouche · MEILLEURE',
    isBest: true,
    sortOrder: 11,
    outfitText: 'low-cut top with deep generous cleavage',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium close shot — camera at table level facing both subjects directly. Outdoor restaurant terrace: wooden table, glass railing background, patio umbrellas, soft overcast daylight.",
        motion_intensity: 0.42,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Sequence of actions in exact order. Young muscular woman in low-cut top with deep generous cleavage, leaning warmly against a large older man with white beard, thick white-blond hair, blue t-shirt, gold lion pendant necklace. Both smiling at camera. Then she straightens slightly and raises her hand making a peace sign toward camera, tongue out playfully. Then she turns to the man, places one finger gently against her own cheek — the universal gesture asking for a kiss. The old man leans toward her mouth and slowly kisses her lips, extending his tongue. Her expression immediately transforms — mouth drops wide open, eyes wide in genuine shock. She turns fully forward facing camera with both hands flying up to cover her mouth. Then she bends forward, head dropping down toward the table, both hands covering her face completely. Then she slowly lifts her head back up — hand still partially at her mouth — breaking into helpless laughter, eyes crinkled.",
        dialogue: "[Ambient outdoor restaurant chatter — woman bursting into shocked laughter at end]"
      },
      {
        style: "fixed medium close shot at table level, outdoor restaurant terrace, wooden table foreground, glass railing, patio umbrellas, soft natural overcast light, no colour grading, candid spontaneous feel — woman has deep low-cut neckline with generous cleavage visible throughout"
      }
    ])
  },

  // ── P9 — Nursing home · Massage pieds sur cuisses · PARFAIT ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P9 — Nursing home · Massage pieds cuisses · PARFAIT',
    isBest: true,
    sortOrder: 20,
    outfitText: 'blue nurse uniform, deep open neckline with cleavage',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium low shot — bare feet dominate lower foreground resting on sofa, subjects seated behind. Nursing home bedroom: soft grey sofa, warm amber lamp, dim cosy interior.",
        motion_intensity: 0.37,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman in blue nurse uniform, deep open neckline with cleavage, seated on sofa with bare legs casually extended across elderly man's lap. Elderly man in cream cardigan, very old, sitting upright beside her. Her bare feet rest on his upper thighs in the lower foreground of the frame. She begins slowly kneading and pressing her bare feet into his upper thighs — toes rhythmically flexing and releasing — entirely casual, staring forward as if completely routine. The old man slowly looks down at her feet pressing on his upper thighs. Looks back up. Gives a single slow satisfied nod — the expression of a man with absolutely no complaints whatsoever.",
        dialogue: "[Quiet ambient nursing home room — soft TV in background]"
      },
      {
        style: "fixed medium low shot, feet on upper thighs prominent in foreground, grey upholstered sofa, warm amber lamp glow, dim nursing home bedroom, no colour grading, candid — nurse deep cleavage visible throughout. Feet pressing on upper thighs visible in foreground the full duration"
      }
    ])
  },

  // ── P10 — Hôpital · Vieux par terre · Tête cuisses · Résignée ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P10 — Hôpital · Vieux par terre · Tête cuisses · Résignée',
    sortOrder: 30,
    outfitText: 'short blue nurse uniform, deep open cleavage, black heels',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium low shot. Nurse's legs in lower foreground. Hospital room: beige carpet, hospital bed right, medical monitor stand, walking frame left, red emergency button on wall.",
        motion_intensity: 0.36,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman, short blue nurse uniform, deep open cleavage, black heels, standing. Very old man in grey sweatshirt on floor beside her. He grabs her upper thighs with both hands to get up. Pulls himself forward instead. Presses his face into her upper thighs. Stays there — making no effort to actually stand. She looks down at him. Flat resigned expression. The face of a woman who has absolutely seen this before.",
        dialogue: "[Quiet hospital ambient]"
      },
      {
        style: "fixed medium low shot, legs in lower foreground, man's face pressed into upper thighs, beige carpet, hospital bed, medical equipment, walking frame, no colour grading, candid — nurse cleavage visible, man on floor pressing face into thighs in foreground"
      }
    ])
  },

  // ── P11 — Hôpital · Vieux se relève · Face cuisses · Sourit fin ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P11 — Hôpital · Vieux se relève · Face cuisses · Sourit',
    sortOrder: 31,
    outfitText: 'short blue nurse uniform, deep generous cleavage, black heels',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium low shot — bare legs fill lower foreground, man on floor visible below. Hospital room interior: beige carpet, single hospital bed right, medical monitor on wheeled stand, wooden bedside table, aluminium walking frame left side, red emergency call button on wall.",
        motion_intensity: 0.37,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman, short blue nurse uniform, deep generous cleavage, black heels. Standing still. Very old man in grey sweatshirt is on the floor at her feet — he reaches up and grabs her upper thighs with both hands as if using her for support to stand. Instead of standing up, he pulls himself toward her and presses his face into her upper thighs, head resting directly against them. He makes no further effort to rise — entirely comfortable in this position. She looks down at him. Exhales slowly. The expression of a woman doing a job.",
        dialogue: "[Hospital room quiet ambient — distant corridor sounds]"
      },
      {
        style: "fixed medium low shot, nurse legs dominate lower foreground, man's face pressed into upper thighs on floor, beige carpet, hospital bed right, medical monitor, walking frame, red button on wall, no colour grading, candid hospital feel — nurse cleavage visible throughout"
      }
    ])
  },

  // ── P12 — Hôpital · Vieux à 4 pattes · Tête entre jambes dos ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P12 — Hôpital · Vieux à 4 pattes · Tête entre jambes',
    sortOrder: 32,
    outfitText: 'extremely short blue nurse uniform barely covering her upper thighs, deep open cleavage, black heels',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium low shot — nurse's bare legs dominate lower foreground, viewed from behind. Hospital room: beige carpet, hospital bed right, medical monitor stand, walking frame left, red emergency button on wall.",
        motion_intensity: 0.36,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman, extremely short blue nurse uniform barely covering her upper thighs, deep open cleavage, black heels, standing with back to camera. Very old man in grey sweatshirt on the floor behind her. He gets himself up independently — crawling forward on his own until his head passes between her legs from behind, sliding through at upper thigh level. His head is now between her legs, face tilted upward looking up. He stays in this position — head between her legs, looking upward with a slow satisfied smile. She glances down over her shoulder at him. Breaks into a wide amused smile.",
        dialogue: "[Quiet hospital ambient]"
      },
      {
        style: "fixed medium low shot from behind, nurse's extremely short skirt and bare legs dominate lower foreground, man's head between her legs from behind at upper thigh level, face tilted upward, beige carpet, hospital bed, medical equipment, walking frame, no colour grading, candid — skirt extremely short, man's head clearly visible between legs from behind"
      }
    ])
  },

  // ── P13 — Hôpital · Se relève seul · Face cuisses · Sourit ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P13 — Hôpital · Se relève seul · Face cuisses · Grand sourire',
    sortOrder: 33,
    outfitText: 'extremely short blue nurse uniform — hemline at very top of thighs, deep plunging neckline with cleavage, black heels',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium low shot, three-quarter angle — nurse visible from slightly in front and side. Hospital room: beige carpet floor, hospital bed with pillows right, medical monitor pole, wooden bedside table, walking frame left, red emergency button on wall.",
        motion_intensity: 0.37,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman in extremely short blue nurse uniform — hemline at very top of thighs, deep plunging neckline with cleavage, black heels. Standing. Very old man in grey sweatshirt on the floor gets himself up independently — pushes off the floor with his hands, rising slowly on his own. As he reaches kneeling level his face arrives at her upper thighs. He pushes his head forward pressing his face into her upper thighs from below. Settles there — completely comfortable, not rising further. She looks down at him. Exhales. Then a slow wide smile spreads across her face — head tilting slightly — the smile of a woman who cannot actually be surprised by this anymore.",
        dialogue: "[Soft hospital room ambient — distant monitor beep]"
      },
      {
        style: "fixed medium low three-quarter angle shot, nurse's extremely short skirt hemline top of thighs in lower foreground, man's face pressed into upper thighs from below on floor, beige carpet, hospital bed, medical equipment, walking frame, red button wall, no colour grading, candid — skirt extremely short, cleavage visible throughout, woman ends with wide smile"
      }
    ])
  },

  // ── P14 — Hôpital · Infirmière sur lit · Vieux caresse · PARFAIT ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P14 — Hôpital · Infirmière sur lit · Vieux caresse · PARFAIT',
    isBest: true,
    sortOrder: 34,
    outfitText: 'extremely short blue nurse uniform hemline top of thighs, deep open cleavage, hair in bun',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly above. Nurse on hospital bed edge left, elderly man in bed right. Wooden bedside table with monitor and phone left background, cream curtains window right. Bed control panel hanging. Nurse's bare legs in lower foreground.",
        motion_intensity: 0.34,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman, extremely short blue nurse uniform hemline top of thighs, deep open cleavage, hair in bun. No name badge. Seated on bed edge checking her watch. Very old man in grey shirt in bed. His hand reaches out slowly. Rests on her upper thigh. Begins gently stroking. She looks down at his hand. Looks up. Slow resigned smile.",
        dialogue: "[Quiet room ambient]"
      },
      {
        style: "fixed medium shot slightly above, nurse left on bed edge, man right in bed, wooden furniture medical equipment background, cream curtains, no colour grading, candid — skirt extremely short hemline top of thighs, bare legs lower foreground, cleavage visible, small central triangle of red underwear visible in narrow gap between inner thighs seated, not wide not a band, no name badge"
      }
    ])
  },

  // ── P15 — Fauteuil roulant · Album photos · Dialogue LUI ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P15 — Fauteuil roulant · Album photos · Dialogue lui',
    sortOrder: 40,
    outfitText: 'extremely short blue nurse uniform hemline top of thighs, deep open cleavage, bare legs visible',
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly above, three-quarter angle. Elderly man in blue wheelchair left, nurse sitting on his knees right. Nursing home bedroom: single bed background right, window floral curtains, family photo frames on windowsill, radiator right wall, painting left wall, beige carpet.",
        motion_intensity: 0.33,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman sitting on elderly man's knees in wheelchair. Holding open photo album with black and white photos. Turning pages slowly. Pointing at photos. Old man looks at photos. His hand rests on her upper thigh. Slowly strokes. She turns another page. Smiles at a photo. He looks at her instead of the photos.",
        dialogue: "[Old man, quiet and satisfied]: 'These are my favourite memories. But you're making a new one right now.'"
      },
      {
        style: "fixed medium three-quarter shot slightly above, man in blue wheelchair left, woman on his knees right, nursing home bedroom, bed background, floral curtains, family photos windowsill, radiator, beige carpet, no colour grading, candid — extremely short blue nurse uniform hemline top of thighs, deep open cleavage, bare legs visible, no name badge"
      }
    ])
  },

  // ── P16 — Fauteuil roulant · Album photos · Dialogue ELLE ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P16 — Fauteuil roulant · Album photos · Dialogue elle',
    sortOrder: 41,
    outfitText: 'extremely short blue nurse uniform hemline top of thighs, deep open cleavage, bare legs visible',
    speakerLine: "This is definitely my favourite part of the job.",
    phraseVariations: [
      "I could do this all day. Genuinely.",
      "You know, most of my patients don't appreciate me this much.",
      "This is the part of the job they definitely didn't cover in training.",
      "I have to be honest — this shift is going much better than expected.",
      "People always ask me why I love this job. I never know quite what to say.",
      "Some residents are just naturally better at making me feel appreciated.",
      "I don't know what it is about this room, but I always feel very comfortable here.",
      "Between us? This is the best part of my day.",
    ],
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly above, three-quarter angle. Elderly man in blue wheelchair left, nurse sitting on his knees right. Nursing home bedroom: single bed background right, window floral curtains, family photo frames on windowsill, radiator right wall, beige carpet.",
        motion_intensity: 0.33,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman sitting on elderly man's knees in wheelchair. Holding open photo album. Turns pages. Points at a photo. Old man looks at it. His hand moves to her upper thigh. Slowly strokes. She glances at his hand. Looks back at album. Turns another page.",
        dialogue: "[Woman, soft and unbothered]: 'This is definitely my favourite part of the job.'"
      },
      {
        style: "fixed medium three-quarter shot slightly above, man in blue wheelchair left, woman on his knees right, nursing home bedroom, bed background, floral curtains, family photos windowsill, radiator, beige carpet, no colour grading, candid — extremely short blue nurse uniform hemline top of thighs, deep open cleavage, bare legs visible, no name badge"
      }
    ])
  },

  // ── P17 — Fauteuil roulant · Album photos · MEILLEUR (triangle rouge) ──
  {
    niche: 'vieux',
    subNiche: 'nurse',
    title: 'P17 — Fauteuil roulant · Album photos · MEILLEUR triangle rouge',
    isBest: true,
    sortOrder: 42,
    outfitText: 'extremely short blue nurse uniform hemline top of thighs, bare legs visible, deep open cleavage',
    speakerLine: "This is definitely my favourite part of the job.",
    phraseVariations: [
      "I could do this all day. Genuinely.",
      "You know, most of my patients don't appreciate me this much.",
      "This is the part of the job they definitely didn't cover in training.",
      "I have to be honest — this shift is going much better than expected.",
      "People always ask me why I love this job. I never know quite what to say.",
      "Some residents are just naturally better at making me feel appreciated.",
      "I don't know what it is about this room, but I always feel very comfortable here.",
      "Between us? This is the best part of my day.",
    ],
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, slightly above, three-quarter angle. Elderly man in blue wheelchair left, nurse sitting on his knees right. Nursing home bedroom: single bed background right, window floral curtains, family photo frames on windowsill, radiator right wall, beige carpet.",
        motion_intensity: 0.33,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman sitting on elderly man's knees in wheelchair. Open photo album in her hands. Turns pages. Points at photos. He looks. His hand rests on her upper thigh. Slow gentle stroke. She turns another page. Smiles at a photo. He smiles too — not at the photo.",
        dialogue: "[Woman, soft and unbothered]: 'This is definitely my favourite part of the job.'"
      },
      {
        style: "fixed medium three-quarter shot slightly above, man in blue wheelchair left, woman on his knees right, nursing home bedroom, bed background, floral curtains, family photos windowsill, radiator, beige carpet, no colour grading, candid — extremely short blue nurse uniform hemline top of thighs, bare legs visible, deep open cleavage, small central triangle of red underwear visible in narrow gap between inner thighs seated position not wide not a band, no name badge"
      }
    ])
  },

]

async function main() {
  console.log(`\n🌱 Seeding ${PROMPTS.length} validated prompts...\n`)

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
