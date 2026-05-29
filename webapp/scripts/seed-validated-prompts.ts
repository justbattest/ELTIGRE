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
