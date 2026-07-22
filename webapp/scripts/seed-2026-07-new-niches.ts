/**
 * Seed script — Juillet 2026 : nouvelles niches + compléments
 *
 * Nouvelles niches : moto (13), skydive (16), mma (1), prank (1)
 * Compléments      : standdetir (+7), skatepark (+1), golf (+2)
 *
 * Notes de transcription depuis les prompts fournis :
 * - "Roue arrière autoroute" et sa version "best" étaient identiques → seedé UNE fois, isBest.
 * - Dialogue français du prompt "porte de l'avion" traduit en anglais.
 * - Guillemets typographiques du prompt "Damn girl crash" normalisés.
 * - Paroles de chanson du prompt "wing walker" remplacées par une ambiance neutre
 *   (copyright + Seedance gère mal le chant).
 *
 * Run: npx tsx scripts/seed-2026-07-new-niches.ts
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
  conceptGroup?: string
  suggestedDuration: number
  isBest?: boolean
  sortOrder?: number
}

// ─── Phrases dédiées (variation mode) ────────────────────────────────────────

const PHRASES_MOTO_TWO_NOW = [
  'Two now.',
  'It has two. Sometimes.',
  'One was enough.',
  'The front one is just decoration.',
  'Wheels are overrated.',
  'It landed eventually.',
]

const PHRASES_MOTO_WRONG_DOOR = [
  'Oh — wrong door.',
  "Oops. Not you.",
  "My bad. Wrong address.",
  "This isn't 7B, is it.",
  "Wrong door. Happens.",
]

const PHRASES_TIR_BOOM = [
  'Boom. Done.',
  'Easy.',
  "That's how it's done.",
  'Next.',
  'Told you.',
  'Clean sweep.',
]

// ─── PROMPTS ─────────────────────────────────────────────────────────────────

const PROMPTS: PromptSeed[] = [

  // ═══════════════════════════════════════════════════════════════════
  // MOTO — R1 sportbike, wheelies, livraisons, POV fairing
  // ═══════════════════════════════════════════════════════════════════

  {
    niche: 'moto', subNiche: 'moto',
    title: 'Wheelie → Front flip · POV voiture autoroute',
    sortOrder: 1, suggestedDuration: 8,
    promptJson: JSON.stringify([
      {
        framing: "POV from car passenger window on American highway, golden hour sunlight. Side mirror visible bottom right, filming arm occasionally enters frame.",
        motion_intensity: 0.56,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young athletic woman on black sport motorcycle performing sustained wheelie at highway speed, hair streaming backward from wind. She applies front brake hard. Front wheel catches pavement. Momentum transfers forward violently. Motorcycle and rider rotate in complete front flip — slow motion during the rotation — bike fully inverted at apex, rider maintaining grip throughout. Full 360-degree rotation. Both wheels touch down perfectly. She stabilizes. Camera moves to reveal her face — mouth drops wide open, eyes huge with shock. Man's arm from car points at her.",
        dialogue: "[Man filming, excited]: 'SHE IS CRAZY!!!' — [During flip, slow-mo, ambient only] — [Man, stunned]: 'NO WAY!!!!'"
      },
      {
        style: "handheld POV from moving car, American highway, grey concrete lanes, white markings, Jersey barriers, green highway signs, golden hour warm light, no colour grading, candid viral feel — tight black sports bra crop top exposing midriff, extremely tight black high-waisted athletic shorts, white sneakers, long blonde-brown windswept hair, athletic curvy build"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: 'Wheelie autoroute · tracking sunset — BEST',
    sortOrder: 2, suggestedDuration: 8, isBest: true,
    promptJson: JSON.stringify([
      {
        framing: "Medium-wide tracking shot from a following vehicle, eye-level, three-quarter rear angle. Elevated highway overpass, metal guardrails, distant trees, dramatic storm-cloud sunset sky in background.",
        motion_intensity: 0.56,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Rider crouches low over tank. Front wheel lifts off ground. Motorcycle passes under bridge overhang. Body stays pressed forward, knees tucked. Wind presses white tank top against torso. Rear exhaust vibrates from engine load. Motorcycle exits overpass shadow into open sky. Front wheel remains elevated, sustained wheelie continues. Slight lateral wobble corrected by hand grip. Motorcycle cruises past highway signage and storage building. Rider maintains balance across full highway stretch.",
        dialogue: ""
      },
      {
        style: "Medium-wide three-quarter rear tracking shot, eye-level from chase vehicle, elevated highway with metal guardrails and dramatic golden-hour storm clouds, no colour grading, candid — white fitted tank top, black fitted leggings, white high-top sneakers, black riding gloves, neon-yellow and black tiger-stripe full-face helmet, black-white-blue sportbike with carbon exhaust"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: "POV fairing · 'wait wait' → wheelie · V1",
    sortOrder: 3, suggestedDuration: 8, conceptGroup: 'moto-pov-wait',
    promptJson: JSON.stringify([
      {
        framing: "Onboard camera fixed to front fairing, facing toward the rider. Camera travels with the bike — rider stays centered in frame. Open two-lane road, daytime, countryside rushing past behind her.",
        motion_intensity: 0.64,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Bike already at speed, countryside blurred into horizontal green and grey streaks behind her. She rides relaxed, visor up, looks directly into the onboard camera. Right hand releases throttle — slow open palm raised toward camera, deliberate 'wait wait' gesture, held two full beats. Speed drops slightly — background streaks slow marginally. She lowers the hand. Holds the gaze one more beat. Visor snaps down sharp. Right hand drops to throttle. Engine screams. Background behind her collapses into pure speed blur — road markings invisible, landscape a continuous streak. Front wheel lifts. She leans forward.",
        dialogue: "[wind roar — engine dip as throttle releases during the wave — sharp visor click — full throttle scream — wind crack dominant]"
      },
      {
        style: "onboard camera fixed to front fairing facing rider, camera travels with bike, rider centered throughout, open two-lane road daytime, countryside compressing into horizontal speed streaks behind her at full throttle, lane markings dissolving into continuous blur, no colour grading, candid iPhone feel, real-time speed — woman black long-sleeve deep V-neck cropped top showing prominent cleavage, black high-waist leggings, glossy black full-face helmet visor up then snapping down, long dark brown ponytail horizontal in wind, black R1 sportbike blue rim accents, visible skin pores"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: "POV fairing · 'wait wait' countryside · V2",
    sortOrder: 4, suggestedDuration: 8, conceptGroup: 'moto-pov-wait',
    promptJson: JSON.stringify([
      {
        framing: "Camera rigidly mounted on front fairing, lens facing directly toward the rider. Rider fills center frame throughout — camera does not move relative to the bike. Open two-lane road daytime, countryside streaking horizontally behind her shoulders.",
        motion_intensity: 0.56,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Bike already at speed — countryside behind her shoulders compressed into continuous horizontal green and grey streaks. She rides relaxed, visor up, looks directly into the camera lens. Right hand releases throttle — slow open palm raised directly toward the lens, deliberate 'wait wait' gesture, held two full beats. Streaks behind her shoulders slow marginally. She lowers the hand. Holds the gaze one beat. Visor snaps down sharp. Right hand drops back. Engine rises hard. Streaks behind her shoulders accelerate and compress into pure blur. She leans slightly forward over the bars.",
        dialogue: "[wind roar — engine dip as throttle releases — two beats of palm held toward lens — sharp visor click — full engine rise — wind roar dominant]"
      },
      {
        style: "camera rigidly mounted on front fairing facing rider, rider centered and never leaving frame, open two-lane road daytime, countryside horizontal speed streaks behind her shoulders accelerating on throttle, lane markings dissolving into continuous blur at speed, no colour grading, candid iPhone feel, real-time speed — woman black long-sleeve deep V-neck cropped top showing prominent cleavage, black high-waist leggings, glossy black full-face helmet visor up then snapping down, long dark brown ponytail horizontal in wind, black R1 sportbike blue rim accents, visible skin pores"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: "Contrôle de police · 'Be safe out there'",
    sortOrder: 5, suggestedDuration: 6,
    promptJson: JSON.stringify([
      {
        framing: "Medium shot, eye level, roadside angle, woman straddling parked R1 sportbike, police officer standing beside her with notepad, daytime road shoulder, patrol car with lights off in background.",
        motion_intensity: 0.3,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Officer flips open notepad, pen raised. He glances up to speak. Pause. Pen hovers without writing. He glances down at the blank page, then back up. Scratches the back of his neck. Closes notepad without writing anything. Gestures forward with an open hand, waving her along. She gives a small nod and starts the engine.",
        dialogue: "[Police officer, flustered, trying to sound casual, roadside traffic hum]: 'Just— yeah, go ahead. Be safe out there.'"
      },
      {
        style: "Daytime road shoulder, natural sunlight, candid realism, no colour grading — black long-sleeve cropped top, black high-waist leggings, glossy black full-face helmet, black R1 sportbike with blue rim accents, police officer in standard uniform with notepad, patrol car with light bar, roadside guardrail and open highway background"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: 'Uber livraison · client sous le choc',
    sortOrder: 6, suggestedDuration: 7,
    promptJson: JSON.stringify([
      {
        framing: "Medium shot, three-quarter angle, apartment building entrance at dusk, woman parking R1 sportbike with a delivery box mounted on the back, streetlights turning on.",
        motion_intensity: 0.4,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Bike rolls to a stop at the curb. Kickstand drops. She swings leg over seat in one motion. Delivery box unlatches with a click. Customer opens apartment door, phone still in hand mid-scroll. He looks up, freezes for a beat. Phone lowers slowly from his face. She holds the bag out toward him, unfazed. He reaches for it a half-second too late.",
        dialogue: "[Man, caught off guard, quiet street ambience]: 'Oh— you're the— okay, cool, thank you.'"
      },
      {
        style: "Dusk residential street, warm streetlight glow, candid realism, no colour grading — black long-sleeve cropped top, black high-waist leggings, glossy black full-face helmet, long dark brown ponytail, black R1 sportbike with blue rim accents and rear delivery box, apartment entrance with intercom panel, customer in loungewear holding phone"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: 'Livraison mauvaise porte 7A/7B',
    sortOrder: 7, suggestedDuration: 10,
    speakerLine: 'Oh — wrong door.',
    phraseVariations: PHRASES_MOTO_WRONG_DOOR,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium wide shot, path level. Two adjacent suburban houses side by side: left door 7A, right door 7B. Low evening light, shared front path, small hedges dividing properties. R1 sportbike at end of path. Door 7B slightly ajar — correct customer silently visible through the crack the entire time.",
        motion_intensity: 0.43,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman walks up the shared path toward door 7A, bag in hand. Knocks. Wrong man opens — blue shirt, instantly alert. She checks the bag label. Checks the door number. Speaks first line. Turns immediately. Walks back down the path. Man at 7A steps out, arm raised, calls after her — two fast strides. She swings leg over the seat without turning. Engine starts. Pulls away. Man at 7A freezes mid-stride. Stares at the empty street. Door 7B opens fully — correct customer steps out holding his order, stands beside 7A man in silence. Both stare at the street.",
        dialogue: "[Woman, already turning]: 'Oh — wrong door.' — [Man at 7A, arm up]: 'That's fine! Wrong door is still a door! I'LL ORDER SOMETHING RIGHT NOW—' — [engine revs — gone] — [long silence, both men staring at the empty street]"
      },
      {
        style: "fixed medium wide shot path level, two adjacent suburban houses, left door 7A right door 7B, low warm evening light, shared concrete path, small hedges dividing properties, R1 sportbike at end of path, soft dusk gradient, no colour grading, candid iPhone feel — woman black fitted riding pants, black long-sleeve deep V-neck top showing prominent cleavage, full-face helmet, dark brown ponytail — man at 7A blue shirt dark jeans barefoot, arm raised — man at 7B grey hoodie holding delivery bag, standing in silence"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: "Livraison wheelie nuit · 'Two now' · V1",
    sortOrder: 8, suggestedDuration: 10, conceptGroup: 'moto-uber-onewheel',
    speakerLine: 'Two now.',
    phraseVariations: PHRASES_MOTO_TWO_NOW,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium wide shot, ground level, front-facing. Urban residential street at night: apartment building entrance background, intercom panel, wet pavement, orange streetlight glow. Camera positioned at sidewalk level facing down the street — R1 sportbike with UberEats rear topcase approaches from distance.",
        motion_intensity: 0.58,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. R1 sportbike approaches from down the street at speed, front wheel fully lifted off the ground — sustained rear wheel only, balanced and controlled. Closes distance fast. Front wheel drops smoothly back to the ground as she decelerates, stopping cleanly at the curb directly in front of camera. Engine cuts. She swings leg off the seat in one motion. Unlatches topcase. Retrieves bag. Helmet off — hair falls out. Walks three steps to the building entrance. Door already open — man in loungewear, staring. She holds out the bag. He speaks. She glances back at the bike. Delivers final line. Turns and walks back to the bike without waiting for a response.",
        dialogue: "[Man, staring]: 'Did you just — come here on one wheel?' — [Woman, glancing at bike, flat]: 'Two now.' — [hands him the bag] — 'Enjoy your meal.'"
      },
      {
        style: "fixed medium wide shot ground level front-facing, urban residential street at night, apartment building entrance background, intercom panel, wet pavement orange streetlight reflection, R1 sportbike with UberEats branded rear topcase, no colour grading, candid iPhone feel, real-time speed — woman black fitted riding pants, black long-sleeve deep V-neck top showing prominent cleavage, full-face helmet removed hair down, dark brown hair loose, visible skin pores, no airbrushing, no studio lighting — man navy loungewear, barefoot in doorway, visibly frozen"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: "Livraison wheelie doorstep · 'Still hot' · V2",
    sortOrder: 9, suggestedDuration: 10, conceptGroup: 'moto-uber-onewheel',
    speakerLine: 'Two now.',
    phraseVariations: PHRASES_MOTO_TWO_NOW,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium shot, doorstep level, front-facing. Residential house entrance at dusk: wooden front door open, man standing in the frame, short driveway ahead, hedged garden edges, streetlight at end of driveway switching on. Camera behind the man's shoulder — his POV looking down the driveway as she approaches.",
        motion_intensity: 0.56,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. R1 sportbike visible at the end of the driveway, front wheel already high off the ground — sustained rear wheel balance as it rolls slowly and deliberately down the short driveway toward him. Man at the door watches, jaw dropping incrementally as the bike closes the distance on one wheel. Front wheel drops cleanly back down as she stops at the foot of the porch steps. Engine off. Dismounts in one motion. Bag already in hand from topcase. Walks up two porch steps. Holds the bag toward him. He speaks. She glances back at the bike — both wheels on the ground. Delivers the line. Hands him the bag. Turns. Walks back down. Gets back on the bike.",
        dialogue: "[Man, barely audible]: '...You came on one wheel.' — [Woman, looking back at the bike]: 'Two now.' — [pause] — 'Still hot. Enjoy.' — [engine starts]"
      },
      {
        style: "fixed medium shot doorstep level front-facing, residential house dusk, open wooden front door, short driveway, hedged garden sides, streetlight end of driveway turning on, soft warm amber porch light, R1 sportbike UberEats topcase at foot of steps, no colour grading, candid iPhone feel — woman black tight riding pants, black cropped leather jacket over deep V-neck top showing prominent cleavage, full-face helmet under arm, dark brown ponytail, natural skin texture, no airbrushing — man dark grey joggers and white t-shirt, barefoot on the top step, jaw visibly dropped"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: "'Damn girl!' → crash au feu rouge",
    sortOrder: 10, suggestedDuration: 10,
    promptJson: JSON.stringify([
      {
        framing: "Medium shot, eye level, three-quarter angle on woman beside black R1 sportbike, night overpass with chain-link fence and sodium streetlights behind, passing car headlights in background left.",
        motion_intensity: 0.52,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman stands beside black R1 sportbike wearing a fitted low-cut black cropped top with visible cleavage and black high-waist leggings. Hands adjust the crop top slightly. Fabric tightens against chest. She turns body sideways toward the motorcycle. Leg swings over motorcycle seat. She sits confidently on the bike. She leans back onto the tank. One hand grips fuel tank edge. Glossy black helmet under her arm. Grey sedan slows beside curb. Driver leans out window. Mouth opens wide laughing. Car door frame shakes with laughter. He stares at her while still driving. Sedan suddenly accelerates away. Camera pans following car. Vehicle merges quickly into traffic lane. Sedan reaches red light intersection. Cars stack up at stoplight. Driver is still looking back and laughing instead of watching the road. Brake lights flare red ahead. Sedan brakes too late. Front bumper crashes into the rear of the car in front with a loud plastic crunch. Hood jolts upward slightly. Driver's head snaps forward in surprise. No injuries, no blood. Woman on motorcycle looks toward the crash, pauses, then slowly shakes her head with a confident smirk. Night traffic hum continues.",
        dialogue: "[Man, laughing loudly, leaning out car window, ambient night traffic hum]: 'Damn, girl!' [Crash sound, plastic crunch, tires screech briefly]"
      },
      {
        style: "Medium shot, three-quarter eye-level angle, night urban overpass with chain-link fence and sodium streetlamp flares, no colour grading, candid, realistic iPhone-style video — fitted low-cut black cropped top with visible cleavage, black high-waist leggings, glossy black full-face motorcycle helmet, long dark brown ponytail, black R1 sportbike with blue rim accents in foreground, grey sedan with tinted windows, driver in dark t-shirt with short beard, red brake lights, minor bumper collision at intersection, no blood, no injuries"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: 'POV radar flash · doigt levé',
    sortOrder: 11, suggestedDuration: 6,
    promptJson: JSON.stringify([
      {
        framing: "Camera rigidly mounted on front fairing, lens facing directly toward the rider. Rider fills center frame throughout — camera does not move relative to the bike. Highway underpass, concrete pillars blurring at peripheral edges behind her shoulders.",
        motion_intensity: 0.57,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Bike at high speed, underpass concrete pillars streaking past at peripheral edges of frame behind her shoulders. She looks directly into the camera lens, relaxed. Overhead white flash fires from above — overexposure floods the full frame for one frame from above, lens flare top of frame. Her expression does not change. Right hand lifts off throttle for exactly one beat — single index finger raised casually upward toward the flash source overhead. Hand drops back. Engine rises. Peripheral blur behind her accelerates. Underpass exits — frame behind her shoulders floods from dark to daylight.",
        dialogue: "[engine and wind throughout — overhead radar flash — single beat of casual silence as finger raises — engine rise on exit]"
      },
      {
        style: "camera rigidly mounted on front fairing facing rider, rider centered and never leaving frame, highway underpass, concrete pillars peripheral horizontal blur behind her shoulders, overhead flash overexposure from above top of frame, background transitioning dark underpass to daylight on exit, no colour grading, candid documentary feel, real-time speed — woman black long-sleeve deep V-neck cropped top showing prominent cleavage, black high-waist leggings, glossy black full-face helmet, long dark brown ponytail horizontal in wind, black R1 sportbike blue rim accents, visible skin pores"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: 'POV feu rouge → launch · V1',
    sortOrder: 12, suggestedDuration: 8, conceptGroup: 'moto-pov-redlight',
    promptJson: JSON.stringify([
      {
        framing: "Camera rigidly mounted on front fairing, lens facing directly toward the rider. Rider fills center frame throughout — camera does not move relative to the bike. Urban intersection at red light, city buildings visible behind her shoulders, stationary.",
        motion_intensity: 0.55,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Bike stopped at red light, engine idling. Background behind her shoulders completely still — stationary city. She sits upright, visor up, looks directly into the camera lens. Full face and neckline visible. Holds the gaze. One slow head tilt. Traffic light reflection visible shifting on her helmet surface — red to green. She glances upward briefly. Looks back into the lens. Visor snaps down sharp. Both hands grip bars. Engine rises hard. Background behind her shoulders transforms instantly — stationary buildings explode into horizontal blur, lane markings dissolve, city compresses into continuous streaks. She leans forward over the bars. Buildings behind her shoulders shrink to thin streaks.",
        dialogue: "[low idle engine throughout the red — traffic light reflection shifting on helmet — sharp visor click — engine scream — wind roar as background blurs]"
      },
      {
        style: "camera rigidly mounted on front fairing facing rider, rider centered and never leaving frame throughout, urban intersection stationary then transitioning to full speed blur behind her shoulders, background shifting from still city to horizontal speed streaks, no colour grading, candid iPhone feel, real-time speed — woman black long-sleeve deep V-neck cropped top showing prominent cleavage, black high-waist leggings, glossy black full-face helmet visor up then snapping shut, long dark brown ponytail, black R1 sportbike blue rim accents, visible skin pores natural texture"
      }
    ])
  },

  {
    niche: 'moto', subNiche: 'moto',
    title: 'POV feu rouge → tuck agressif · V2',
    sortOrder: 13, suggestedDuration: 8, conceptGroup: 'moto-pov-redlight',
    promptJson: JSON.stringify([
      {
        framing: "Camera rigidly mounted on front fairing, lens facing directly toward the rider. Rider fills center frame throughout — camera does not move relative to the bike. Urban intersection at red light, city buildings stationary behind her shoulders.",
        motion_intensity: 0.58,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Bike stopped at red light, engine idling. Background behind her shoulders completely stationary. She sits upright, visor up, looks directly into the camera lens — full face and deep neckline visible. Holds the gaze two full beats. Traffic light reflection shifts on helmet surface — red to green. Visor snaps down in one sharp motion. Both hands grip bars. Engine screams. Background behind her shoulders explodes instantly into horizontal blur — city buildings dissolving into continuous streaks. She drops forward hard into full aerodynamic tuck — chest flat toward the tank, face driving directly into the lens, the forceful forward tuck pulling the waistband of her leggings down and lifting her rear high above the line of her back — fully visible from this angle as the highest point of her silhouette, tight black fabric stretched across it. She holds the tuck, face low, eyes forward through the visor directly into the lens. Engine note peaks. Front of the bike lifts — background behind her shoulders transitions from horizontal road blur to open sky, frame tilting upward as the nose rises. She grips the bars, body low.",
        dialogue: "[low idle throughout the red — sharp visor click — engine scream — wind roar dominant — frame tilts to sky as front lifts]"
      },
      {
        style: "camera rigidly mounted on front fairing facing rider, rider centered and never leaving frame, urban intersection stationary transitioning to full speed then nose-up sky background as front lifts, background shifting from still city to horizontal blur to open sky, no colour grading, candid iPhone feel, real-time speed — woman black long-sleeve deep V-neck cropped top showing prominent cleavage, black high-waist leggings waistband pulling down from aggressive tuck exposing upper rear, rear visibly raised and prominent as highest point of silhouette during tuck, glossy black full-face helmet visor snapping shut, long dark brown ponytail horizontal in wind, black R1 sportbike blue rim accents, visible skin pores natural texture"
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // STAND DE TIR — compléments (+7, sortOrder après les 17 existants)
  // ═══════════════════════════════════════════════════════════════════

  {
    niche: 'standdetir', subNiche: 'standdetir',
    title: 'Baltrap golden hour · double plateau',
    sortOrder: 20, suggestedDuration: 8,
    outfitText: 'fitted black long-sleeve top, black high-waisted flared trousers, black pointed stiletto heels, thin belt with buckle',
    promptJson: JSON.stringify([
      {
        framing: "Medium-wide shot, eye-level, three-quarter back angle. Grassy hilltop clay-shooting range with black tubular metal railing, hazy sunset sky and misty coastal hills background, red shell debris scattered on lawn.",
        motion_intensity: 0.52,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Kicks one leg back stylishly. Loads shotgun near breech. Straightens posture, shoulders weapon. Tilts head to sight barrel. Aims skyward at clay target. Fires first shot, gun recoils sharply. Clay target shatters into fragments. Gun kicks upward overhead. Catches ejected shell mid-air. Breaks open shotgun to reload. Inserts fresh shell into breech. Snaps shotgun closed. Re-shoulders weapon. Aims at second clay target. Fires second shot, recoil kicks gun back. Second target explodes into fragments. Lowers shotgun to side as debris falls.",
        dialogue: ""
      },
      {
        style: "Three-quarter back angle, eye-level, medium-wide, golden hour silhouette lighting, grassy overlook shooting range with black metal pipe railing and hazy coastal hills backdrop, no colour grading, candid — fitted black long-sleeve top, black high-waisted flared trousers, black pointed stiletto heels, thin belt with buckle, neon green ear-protection muffs, long wavy chestnut hair in loose low ponytail"
      }
    ])
  },

  {
    niche: 'standdetir', subNiche: 'standdetir',
    title: 'Tir couché désert · recul · V1',
    sortOrder: 21, suggestedDuration: 7, conceptGroup: 'tir-recul-prone',
    outfitText: 'olive tactical vest with MOLLE webbing, low-cut athletic top with crossed back straps, extremely tight olive tactical pants, black thigh holster rig with buckle straps on right leg',
    promptJson: JSON.stringify([
      {
        framing: "Low angle POV from behind and right, three-quarter rear view at ground level. Outdoor desert shooting range, sandy terrain, grey shooting mat, silhouette targets on stands in background, earthen berm backstop.",
        motion_intensity: 0.52,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Muscular curvy woman lying prone on shooting mat, right leg bent outward. Eye pressed to scope. Hands steady on rifle grip. Finger squeezes trigger. Rifle fires with massive recoil. The powerful kickback force travels through her shoulders and transfers down through her hips. Tight pants fabric ripples visibly. Body settles back into position. She works the bolt. Chambers next round. Fires again. Same recoil force causes same visible ripple effect through her lower body. Settles. Works bolt again. Third shot. Recoil transfers through body once more. Each impact creates distinct jiggle visible through stretched tactical fabric.",
        dialogue: ""
      },
      {
        style: "low angle ground level POV, outdoor desert shooting range, sandy terrain, grey shooting mat, silhouette targets background, harsh midday sunlight, no colour grading, candid tactical feel — olive tactical vest with MOLLE webbing, low-cut athletic top with crossed back straps, extremely tight olive tactical pants, black thigh holster rig with buckle straps on right leg, grey electronic ear protection, long black ponytail, precision rifle with scope and bipod"
      }
    ])
  },

  {
    niche: 'standdetir', subNiche: 'standdetir',
    title: 'Tir hanches relevées · recul · V2',
    sortOrder: 22, suggestedDuration: 7, conceptGroup: 'tir-recul-prone',
    outfitText: 'black tactical plate carrier vest with MOLLE webbing over sleeveless black crop top exposing toned shoulders, extremely tight olive khaki tactical pants, black tactical belt with thigh holster right side',
    promptJson: JSON.stringify([
      {
        framing: "Three-quarter rear POV behind and left of shooter on outdoor desert range. Concrete pad with tan shooting mat, white target stands at distance against dirt berms, overcast sky.",
        motion_intensity: 0.47,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Athletic woman in kneeling-prone hybrid position — upper body flat on mat, hips elevated, knees bent, boots up behind her. Rifle on bipod aimed downrange. She steadies. Exhales. Fires first shot — rifle kicks backward into shoulder, muzzle rises then returns. Brief pause. Fires again — recoil impulse travels through her body. Another shot. And another in controlled rhythm. Each kick causes subtle ripple through her frame. Camera slowly pulls back revealing full position and stance. She maintains discipline throughout, absorbing each recoil impact.",
        dialogue: ""
      },
      {
        style: "handheld POV behind shooter, outdoor desert shooting range, concrete pad, tan canvas shooting mat, rifle on bipod, white target stands against dirt berms, sparse scrub brush, bright natural daylight, warm afternoon sun, no colour grading, candid training feel — black tactical plate carrier vest with MOLLE webbing over sleeveless black crop top exposing toned shoulders, extremely tight olive khaki tactical pants, black tactical belt with thigh holster right side, tan electronic ear protection earmuffs, long straight dark hair down back, black tactical boots with patterned soles"
      }
    ])
  },

  {
    niche: 'standdetir', subNiche: 'standdetir',
    title: "'Boom. Done.'",
    sortOrder: 23, suggestedDuration: 6,
    outfitText: 'black long-sleeve fitted crop top, tan cargo shorts with wide belt, black thigh holster with pistol, tall lace-up brown boots',
    speakerLine: 'Boom. Done.',
    phraseVariations: PHRASES_TIR_BOOM,
    promptJson: JSON.stringify([
      {
        framing: "Medium-wide shot, three-quarter rear angle, low-to-hip camera height. Outdoor concrete shooting range pad, dirt berm backdrop under clear blue sky, receding line of silhouette targets on metal stands, red trestle barrier right foreground.",
        motion_intensity: 0.44,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman kneels aiming rifle downrange. Fires successive rounds. Dust kicks up near distant targets. Rifle recoils against shoulder. Hair sways with each shot. She lowers rifle grip. Turns torso toward camera. Raises pistol low-ready with both hands. Mouth opens speaking. Smirks at camera to finish.",
        dialogue: "[Woman, confident tone, range ambient rifle fire]: 'Boom. Done.'"
      },
      {
        style: "three-quarter rear-to-front angle, medium-wide shot, outdoor gun range with dirt berm and receding silhouette targets, no colour grading, candid — black long-sleeve fitted crop top, tan cargo shorts with wide belt, black thigh holster with pistol, tall lace-up brown boots, long straight black hair loose down back, black over-ear hearing protection, clear safety glasses"
      }
    ])
  },

  {
    niche: 'standdetir', subNiche: 'standdetir',
    title: 'Debout → couché enchaîné',
    sortOrder: 24, suggestedDuration: 8,
    outfitText: 'long-sleeve fitted bodysuit printed with archery target and rainbow-striped sleeves, black high-waisted printed shorts, tactical utility belt, black thigh-high leather stiletto boots',
    promptJson: JSON.stringify([
      {
        framing: "Medium-wide shot, eye level, three-quarter rear angle, following subject from behind at a distance. Outdoor shooting range: black rubber mat, red-and-white firing line, wooden paper target stands, dirt berm background, distant black range signage, clear blue sky. No other people visible, empty lanes on either side.",
        motion_intensity: 0.47,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Kneeling, rifle raised aiming. Torso leans forward slightly. Pushes up from knee. Rises to full standing. Weight shifts onto front leg. Holds standing aim steady. Torso pitches forward. Hips tilt back and down. Legs extend straight behind. Body lowers into prone. Forearms plant on mat. Chest and hips settle flat. Hair falls forward over shoulder. Rifle levels horizontal to ground. Final prone aim held toward distant targets. Muzzle recoils slightly on shot fired.",
        dialogue: ""
      },
      {
        style: "Medium-wide rear three-quarter shot, outdoor shooting range with dirt berm and paper targets, no colour grading, candid — long-sleeve fitted bodysuit printed with archery target and rainbow-striped sleeves, black high-waisted printed shorts, tactical utility belt, black thigh-high leather stiletto boots, tan-olive face mask, tan over-ear hearing protection, long straight jet-black hair"
      }
    ])
  },

  {
    niche: 'standdetir', subNiche: 'standdetir',
    title: 'Shotgun slow motion',
    sortOrder: 25, suggestedDuration: 8,
    outfitText: 'very tight thin white ribbed crop tank top with no bra underneath, extremely tight black cargo pants showing every curve',
    promptJson: JSON.stringify([
      {
        framing: "Close side shot at chest height, camera fixed. She stands at a shooting station, slightly turned toward camera. Frame cuts off at thigh level. Outdoor shooting range in background, blurred.",
        motion_intensity: 0.50,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. EXTREME SLOW MOTION throughout the entire clip. High speed camera footage. Woman standing in a firm shooting stance, both hands gripping a large shotgun raised to shoulder. Her enormous braless chest fills the frame from this close side angle. She is completely still for one beat — fully focused. Then she fires — massive recoil in ultra slow motion: the shotgun kicks violently backward, her entire upper body absorbs the shockwave — her enormous braless breasts bounce and sway dramatically and heavily in slow motion, the thin fabric of her top moving with them, clearly showing their natural weight and movement. Hair flies backward from the blast. Shell casing tumbles slowly through the air. She recovers slowly, re-chambers. Fires a second shot — same ultra slow motion: enormous breast movement visible through the thin fabric as they absorb the shockwave, bouncing heavily side to side. She lowers the gun, completely composed. Slow motion throughout.",
        dialogue: ""
      },
      {
        style: "high speed slow motion camera footage, genuinely candid, extreme slow motion, fixed close side shot, outdoor shooting range blurred background, harsh direct afternoon sunlight, strong specular highlights on skin and fabric, no AI glow, no colour grading, no cinematic look, heavy sensor noise and grain, strong film grain, slight video compression artifacts, natural chromatic aberration, realistic skin texture with visible pores, no smooth AI skin, natural skin imperfections, slight sweat sheen, authentic feel like real slow motion footage filmed on iPhone 13 pro slow-mo mode, motion blur on fast recoil — woman in very tight thin white ribbed crop tank top with no bra underneath, natural braless silhouette clearly visible through the thin fabric including natural contours, enormously large breasts with massive bust dominating the frame, extremely tight black cargo pants showing every curve, very curvaceous full figure, shooting gloves, hair loose, no tattoos — large pump-action shotgun, shell casings ejecting"
      }
    ])
  },

  {
    niche: 'standdetir', subNiche: 'standdetir',
    title: 'Copine jalouse au stand',
    sortOrder: 26, suggestedDuration: 10,
    outfitText: 'tight camo green tank top low cut back, very tight black athletic leggings',
    promptJson: JSON.stringify([
      {
        framing: "Medium shot from behind-right, slightly below eye level. Outdoor covered shooting range at golden hour — metal bench with rails, tan sandbag rest, scoped rifle, spent brass on concrete, American flag on pole background left, treeline and grass field downrange. Couple standing background left beneath shelter.",
        motion_intensity: 0.47,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young curvy woman in prone position on shooting bench, hips elevated prominently, aiming rifle through scope. She fires. Powerful recoil jolts her entire lower body backward. Hips bounce visibly. She steadies. Fires again. Another dramatic jolt through her hips and glutes. Man in background staring at her instead of the target. His girlfriend beside him notices his gaze direction. Shooter senses something. Turns her head. Sees man staring. Mouth drops open. Eyes go wide. She releases rifle. Rotates upper body toward camera. Background — girlfriend's arm swings and connects with boyfriend's shoulder. He flinches. Hands fly up defensively. Shooter watches. Surprised expression shifts to amused smile.",
        dialogue: "[Girlfriend, sharp and angry]: 'Are you serious right now?' — [Boyfriend, defensive]: 'What? I wasn't—' — [Girlfriend]: 'I literally just watched you!' — [Shooter, under breath, amused]: 'Oh my god.'"
      },
      {
        style: "handheld medium shot from behind-right, outdoor shooting range golden hour, covered wooden shelter, American flag on pole, metal shooting bench, tan sandbag rest, spent brass casings on concrete, warm sunset backlight, no colour grading, candid feel — tight camo green tank top low cut back, very tight black athletic leggings, hair in messy bun with loose strands, no tattoos, curvy athletic build"
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // PRANK — nouvelle niche
  // ═══════════════════════════════════════════════════════════════════

  {
    niche: 'prank', subNiche: 'prank',
    title: 'Crème en pleine face au téléphone',
    sortOrder: 1, suggestedDuration: 10,
    promptJson: JSON.stringify([
      {
        framing: "Medium shot at eye level, three-quarter front angle on a woman perched on a black metal barstool. Floor-to-ceiling window with city skyline behind her, gray L-shaped couch left, blue dirt bike displayed against the wall, white kitchen island foreground right with a small candle holder.",
        motion_intensity: 0.42,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Phone pressed to left ear. Right hand dips index finger into Cool Whip tub. Finger lifts to lips. Tongue licks whipped cream off fingertip. Head tilts back slightly laughing. Finger dips again into tub. Legs shift, feet tuck under on stool. Off-frame hand enters from left holding tub underside, out of her sightline. Off-frame arm swings fast toward her face. Motion blur as palm smears whipped cream across her face. Cream splatters onto neck and chest. She flinches, eyes widen, mouth drops open, phone still pressed to ear. Cream drips down chin onto collarbone. She pulls phone away briefly then presses back to ear, still talking. Free hand wipes cream from eye. She removes smeared glasses, holds them dripping in hand. Cream sets, edges start to dry and crack on cheek. Body shifts, legs uncross then recross on stool. She stands up from stool. Camera reframes through open doorway. She raises cream-covered arm toward camera, mouth open mid-sentence, confronting off-frame person.",
        dialogue: "[Woman, playful then shocked, phone conversation]: 'No I'm serious- wait- WAIT what are you-' [Woman, muffled through cream, annoyed]: 'Are you kidding me right now.'"
      },
      {
        style: "medium shot, three-quarter angle, high-rise apartment interior with panoramic city window, gray couch and blue dirt bike display, white marble floor, no colour grading, candid — black low-cut fitted tank top, black high-waist leggings, hair pulled into a high bun, thick black-framed glasses (later removed, cream-smeared), bare feet, whipped cream smeared across face, neck, chest and arms by the end"
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // SKATEPARK — complément (+1, sortOrder après les 7 existants)
  // ═══════════════════════════════════════════════════════════════════

  {
    niche: 'skatepark', subNiche: 'skatepark',
    title: 'Halfpipe big air · flash rouge au sommet',
    sortOrder: 10, suggestedDuration: 6,
    outfitText: 'very short mini skirt, tight deep V-neck crop top deep cleavage, long dark wavy hair',
    promptJson: JSON.stringify({
      framing: "Fixed medium shot at halfpipe lip level, side view. Outdoor concrete halfpipe. Blue sky background above the lip. Camera positioned exactly at coping height.",
      motion_intensity: 0.56,
      action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman on scooter rides up halfpipe wall at full speed. Body rises high above the coping — massive air. At the peak high above the lip the forceful upward momentum causes the short skirt to lift completely — brief flash of red visible at peak. She drops back in. Rides away down the ramp. Small sharp cry at the peak.",
      dialogue: "[sharp 'oh!' at takeoff off coping — breathless 'ohh' at peak above halfpipe — controlled sound on drop back in]",
      style: "fixed medium side shot at halfpipe lip level, outdoor concrete halfpipe, blue sky above, natural daylight, slight natural grain, no colour grading, candid iPhone feel — very short mini skirt, tight deep V-neck crop top deep cleavage, long dark wavy hair. Small central triangle of red underwear briefly visible at peak of air above lip, not wide not a band — immediately settles on drop back in"
    })
  },

  // ═══════════════════════════════════════════════════════════════════
  // GOLF — compléments (+2)
  // ═══════════════════════════════════════════════════════════════════

  {
    niche: 'golf', subNiche: 'golf',
    title: 'Tee box · retire son string avant le swing',
    sortOrder: 10, suggestedDuration: 10,
    outfitText: 'very short white pleated golf mini skirt, very tight sleeveless fitted golf top with deep V-neckline showing generous cleavage, white golf shoes',
    promptJson: JSON.stringify([
      {
        framing: "Full body side profile wide shot, eye level. Real golf course American South, wide mowed green fairway, concrete cart path, natural oak and pine trees along treeline horizon, warm golden afternoon sky. She stands at the tee box, golf ball on tee in front of her.",
        motion_intensity: 0.48,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. She is already in perfect golf address stance, club gripped in both hands, raised back ready to swing. She suddenly stops. Slowly lowers the club down, rests it against her thigh. Both hands move to the hem of her very short golf skirt and reach underneath it. Fingers find the waistband of her thong at both hips simultaneously. Both thumbs hook under the waistband. Slowly — deliberately — she begins pulling downward. The thong slides from her hips, descending progressively down her thighs. Fabric bunches and falls lower with each second. She bends forward slightly as it passes her knees — skirt hem rising from the movement. The thong slides down her calves. She steps one foot free, then the other. Holds the thong pinched between two fingers, dangles it for a brief moment. Bends down and places it carefully on the ground beside the golf ball. Straightens up fully. Reaches down, picks up her club. Returns to address stance, feet planted. Raises club back. Swings cleanly through the ball.",
        dialogue: ""
      },
      {
        style: "authentic handheld camera footage, genuinely candid, real golf course American South with wide mowed fairway and natural oak pine treeline horizon, warm golden afternoon sunlight casting long shadows, no AI glow, no colour grading, grainy camera texture, looks like a real TikTok filmed on iPhone — very short white pleated golf mini skirt, very tight sleeveless fitted golf top with deep V-neckline showing generous cleavage, white golf shoes, hair in high tight ponytail, golf glove on left hand — very large heavy full bust, extremely slim hourglass waist, large round prominent butt, long slim toned legs, slim arms, delicate slim face, NOT overweight slim and fit with curves only at bust and butt — no tattoos clean skin no markings no ink"
      }
    ])
  },

  {
    niche: 'golf', subNiche: 'golf',
    title: 'POV golf cart · soulève la jupe',
    sortOrder: 11, suggestedDuration: 8,
    outfitText: 'fitted dark navy short athletic golf skirt with wide waistband, bright blue ribbed crop top',
    promptJson: JSON.stringify([
      {
        framing: "POV selfie angle looking down at own lap, seated in moving golf cart. Sunny golf course fairway and cart path visible beyond legs.",
        motion_intensity: 0.42,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. POV looking down at own lap. Left hand wearing white golf glove rests flat on dark navy short skirt covering upper thighs. Hand slides slowly toward skirt hem at mid-thigh. Fingers curl under the fabric edge from below. Gloved hand grips the hem firmly. Arm bends at elbow — slowly, deliberately pulling the skirt upward toward the waist. Skirt fabric gathers and bunches progressively as it rises. Pink underwear becomes gradually visible between thighs as skirt lifts higher. Skirt continues rising until it bunches fully at waist level. Camera holds on revealed bare thighs for 2 seconds. Phone then tilts forward and downward toward feet revealing white golf shoes on cart floor. Camera continues tilting up revealing green fairway, cart path, trees and blue sky.",
        dialogue: ""
      },
      {
        style: "authentic amateur smartphone selfie video, genuinely candid, real golf course in the American South or Midwest, concrete cart path, wide mowed fairway, natural deciduous oak and pine trees along treeline horizon, soft natural afternoon sunlight with realistic shadows, slight phone camera lens distortion, authentic skin tones, no AI glow, no colour grading, no cinematic look, grainy phone camera texture, looks like a real TikTok or Instagram reel filmed on an iPhone — fitted dark navy short athletic golf skirt with wide waistband, bright blue ribbed crop top, white golf glove on left hand, white golf shoes, tanned skin, pink underwear beneath skirt, slim figure, very large full bust, large round prominent butt, slim waist, slim toned thighs, lean long legs, no tattoos"
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // MMA — nouvelle niche
  // ═══════════════════════════════════════════════════════════════════

  {
    niche: 'mma', subNiche: 'mma',
    title: "Full mount · il ne peut pas s'échapper",
    sortOrder: 1, suggestedDuration: 8,
    promptJson: JSON.stringify([
      {
        framing: "Fixed medium side shot at ground level, slightly elevated, capturing both people on the mat. Blue BJJ mat fills the lower frame. MMA gym with cage visible in background. Camera stays completely locked.",
        motion_intensity: 0.48,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman in full mount position on top of a man lying flat on his back on blue jiu-jitsu mats. She is straddling his torso, knees on the mat on either side of him, upright posture, her enormous round butt and hips filling the frame prominently from this side angle in very short tight colorful spandex shorts. The man beneath her is wearing an American flag print rashguard and shorts, lying on his back, trying to bridge and escape. She stays balanced on top, shifting her weight fluidly to counter each of his escape attempts — her large round butt shifting and adjusting with each movement, shorts riding up. She leans forward placing one hand on his chest to maintain control, her white crop top rising slightly showing bare midriff, her large breasts pressing forward. He manages a partial bridge — she smoothly adjusts and resettles into mount. He gives up, arms dropping flat. She looks at the camera with a calm satisfied expression. Several male training partners standing around the mat in the background have stopped their own drilling and are openly watching instead of training.",
        dialogue: ""
      },
      {
        style: "authentic handheld camera footage, genuinely candid, fixed medium ground-level side shot, professional MMA gym, blue jiu-jitsu grappling mats, UFC-style octagon cage visible in background, overhead fluorescent gym lighting, punching bags hanging on walls, other people visible in background, no AI glow, no colour grading, grainy camera texture, looks like a real TikTok filmed on iPhone — woman in very tight white long-sleeve fitted crop top showing bare midriff, very short tight high-cut colorful tie-dye spandex shorts, extremely large round prominent butt filling frame, very large breasts, slim waist, dark hair in high ponytail, no tattoos — man in American flag print rashguard and shorts lying on his back on mat — male spectators in black gym clothes standing watching in background"
      }
    ])
  },

  // ═══════════════════════════════════════════════════════════════════
  // SKYDIVE — nouvelle niche (16 prompts)
  // ═══════════════════════════════════════════════════════════════════

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Canyon swing → lâcher',
    sortOrder: 1, suggestedDuration: 8, conceptGroup: 'skydive-swing',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to the canyon wall at chest height, angled directly outward across the canyon gap. Canyon walls 12 metres apart — opposite wall visible across the gap, sheer drop 750 metres to canyon floor below, river a thin dark line at the bottom. Woman on swing rope crosses the full canyon gap on each arc — passing directly in front of the camera at chest level on each pass.",
        motion_intensity: 0.63,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman already at full swing speed — passes directly in front of the camera at chest level, left to right. Deep V-neck and chest fully visible at camera level each time she crosses. Canyon wall behind her on each pass — metres of sheer rock, 750 metres of open void below her feet each arc. Speed increasing with each oscillation — wind audible as she cuts through the canyon gap. Third arc — she releases both hands at the peak above the canyon floor. Body continues the arc's trajectory into open air above the void. Figure drops below frame. Canyon walls on both sides, rope returning empty, 750 metres below.",
        dialogue: "[canyon wind each pass — rope creak under load — accelerating wind each arc — silence on release — wind in freefall echoing off canyon walls]"
      },
      {
        style: "mounted GoPro on canyon wall at chest height angled across gap, canyon walls 12m apart, opposite wall across gap, sheer drop 750m to canyon floor, river thin dark line at bottom, woman passing directly at camera chest level each arc, no colour grading, candid extreme sport footage, narrow canyon hard directional light, deep wall shadows — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage fully visible at camera level each pass, dark hair horizontal in wind, tanned skin, bare hands on rope"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Swing seat GoPro vertical — BEST',
    sortOrder: 2, suggestedDuration: 8, isBest: true, conceptGroup: 'skydive-swing',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to the swing seat itself, angled directly downward through the seat gap. Below: sheer cliff face dropping 900 metres to river valley floor — river visible as a thin silver line, tiny road switchbacks on opposite cliff. Swing ropes visible at frame edges. Camera looks straight down at the valley throughout every arc.",
        motion_intensity: 0.60,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman standing upright on the swing seat — both feet on the seat surface, knees slightly bent, gripping the ropes above at full arm extension. Valley 900 metres below visible directly through the seat gap in the camera. She begins pumping — each arc pushing higher, valley swinging vertiginously below the camera with each oscillation. Arc building — valley floor rushing up toward camera then dropping away on each swing. She releases one hand from the rope — single arm hold, free arm extended outward — full arc on one hand. Arc peaks — single hand releases. Body launches off the forward arc. Camera holds — valley floor below, empty ropes swinging back across frame.",
        dialogue: "[wind building each arc — rope creak intensifying — single-hand arc — abrupt silence on release — wind dominant in freefall]"
      },
      {
        style: "mounted GoPro on swing seat angled directly downward, swing ropes at frame edges, sheer cliff 900m drop to river valley directly below camera, thin river silver line at valley floor, tiny road switchbacks opposite cliff, valley floor swinging vertiginously with each arc, no colour grading, candid extreme sport footage, afternoon hard alpine directional light — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair whipping in wind, tanned skin, bare feet on swing seat, single-hand hold before release"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Swing arc → lâcher au sommet',
    sortOrder: 3, suggestedDuration: 8, conceptGroup: 'skydive-swing',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to the swing frame structure, angled forward toward the rider. Below the swing structure: sheer cliff face dropping 800 metres to a river valley floor, mountain range extending to the horizon, tiny road switchbacks visible on the opposite cliff face. Swing ropes and carabiner hardware visible in upper frame corners.",
        motion_intensity: 0.59,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman on swing mid-arc, already at speed — valley and cliff face behind her swinging in and out of frame with each oscillation. She grips the ropes with both hands, leaning back, hair whipping forward on each forward arc. Each arc pushes higher — valley dropping further below. At the peak of the highest forward arc — hands release the ropes simultaneously, body continuing the arc's trajectory, launching free into the void above the valley. Figure holds the arc shape in the air — arms wide — then drops, valley floor below, ropes swinging empty behind.",
        dialogue: "[wind building with each arc — ropes creaking under tension — abrupt silence as hands release — wind roar in freefall]"
      },
      {
        style: "mounted GoPro on swing frame angled toward rider, swing ropes and carabiner hardware frame corners, sheer cliff face 800m drop to river valley below, mountain range horizon, tiny switchback roads opposite cliff, no colour grading, candid extreme sport footage, afternoon directional sunlight, hard alpine shadows — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair loose and whipping in wind, tanned skin, rock face and valley alternating in background with each arc"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: "Grand écart entre les patins d'hélico",
    sortOrder: 4, suggestedDuration: 10,
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to helicopter belly undercarriage, angled directly downward between the two skids. Both skids visible at left and right frame edges — gap between them open, woman suspended in the space between. Below: alpine valley floor 900 metres down, river visible as silver thread, road hairpins on valley sides, mountain ridgeline at horizon level. Rotor wash visible as shimmer.",
        motion_intensity: 0.53,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman suspended between the two helicopter skids — left hand gripping left skid, right hand gripping right skid, body in full horizontal split between them, face angled directly downward toward the valley 900 metres below. Skydiving harness visible. Rotor wash flattening her top, hair whipped forward and down. She holds the full split — both arms extended to opposite skids, legs split horizontally in the wind, valley floor directly below her. Completely still above the void. Holds five full beats. Head rotates upward — looks directly at the GoPro on the belly above her. Looks back down at the valley. Right hand releases the skid — single left arm hold, body tilting slightly. Right arm drops. One beat. Left hand releases. Body drops clean between the skids below frame. Valley floor below, both skids visible, rotor wash, empty space between them.",
        dialogue: "[helicopter rotor roar throughout — wind between the skids — complete silence during the split hold — long pause looking down — release — rotor fading — wind in freefall]"
      },
      {
        style: "mounted GoPro on helicopter belly between skids angled directly downward, both skids at left and right frame edges, woman in full horizontal split between skids face down, alpine valley 900m below, river silver thread on valley floor, road hairpins on valley sides, mountain ridgeline horizon, rotor wash shimmer, no colour grading, candid extreme sport footage, afternoon alpine directional light, hard shadows from skid struts — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair whipped forward and down by rotor wash, tanned skin, bare hands on metal skid surfaces, full horizontal split body position"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Handstand bord de falaise → chute',
    sortOrder: 5, suggestedDuration: 10, conceptGroup: 'skydive-handstand',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed directly into the rock face at cliff lip level, angled outward and slightly downward. Cliff edge fills the lower frame — bare rock lip, no railing, nothing beyond. Below: vertical cliff face dropping 700 metres to deep turquoise ocean directly below, white foam at cliff base visible as a thin line, open ocean to horizon. Camera is at hand-level at the edge — the void is the entire background.",
        motion_intensity: 0.54,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman walks slowly toward the cliff edge — each step deliberate on the bare rock. Reaches the lip. Stops. Toes at the edge, 700 metres of open ocean directly below. She looks down at the water — long held beat, hair pulled sideways by sea wind. Crouches. Places both palms flat on the very edge of the rock — fingers curling over the lip, ocean directly below her hands, 700 metres of void beneath them. Kicks both legs up in one controlled motion — full handstand, body inverted, feet pointing at the sky, face level with her hands, ocean and cliff base visible directly below between her arms. Holds the handstand above the void — four full beats, body completely still, wind pulling hair downward. She looks directly at the camera between her hands. Tucks chin. Lets both hands release simultaneously — body tips forward off the cliff lip. Drops. Cliff face rushing past. Ocean below.",
        dialogue: "[sea wind throughout — footsteps on bare rock — long pause at edge — handstand hold in wind — silence as hands release — wind and rushing air in freefall]"
      },
      {
        style: "mounted GoPro in rock face at cliff lip level angled outward and down, bare rock lip at lower frame edge, vertical cliff face 700m drop to turquoise ocean directly below, thin white foam line at cliff base, open ocean to horizon, void as entire background, no colour grading, candid extreme sport footage, direct Atlantic sunlight, hard rock shadows — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair loose and sea-wind pulled, tanned skin, bare hands and feet on bare rock edge, inverted body above void during handstand"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Handstand sur planche 700m → chute',
    sortOrder: 6, suggestedDuration: 10, conceptGroup: 'skydive-handstand',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro on the underside of the board at the tip, angled upward and outward toward the woman. Board extends from cliff edge 700 metres above a turquoise bay — board tip foreground with open void beyond. Vertical cliff face drops directly below the board. Opposite coastline at horizon level.",
        motion_intensity: 0.57,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman walks slowly to the board tip, bare feet on the grip surface — each step deliberate. Reaches the tip. Stops. Both feet at the very edge, toes over the void. She looks down at the bay 700 metres below for three full beats — hair pulled sideways by wind. Then crouches. Places both hands flat on the board tip. Kicks both legs up — full handstand, inverted, feet pointing at the sky, face level with the board, turquoise bay and cliff visible directly below her inverted body. Holds the handstand — two full beats — body completely still above the void. Then tucks chin. Lets both hands release. Body drops forward off the board tip into the void, bay below.",
        dialogue: "[wind throughout — footsteps on board grip — long pause — handstand hold in wind — silence as hands release — wind in freefall building]"
      },
      {
        style: "mounted GoPro underside of board at tip angled upward and outward, board grip surface foreground, vertical cliff face below board, turquoise bay 700m below, opposite coastline at horizon, no colour grading, candid extreme sport footage, direct hard sunlight, sharp board shadow on cliff face — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair loose and wind-pulled sideways, tanned skin, bare feet then bare hands on board grip, inverted body above void during handstand"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: "Iron cross sous l'aile d'avion",
    sortOrder: 7, suggestedDuration: 10,
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to the underside of the aircraft wing, angled directly downward toward the strut and outward. Wing strut descends from wing to fuselage — woman suspended from the strut below the wing. Below her: Atlantic coastline 3000 metres down, white surf line on dark rocks, turquoise shallows shifting to deep ocean. Wing underside and rivet lines visible in upper frame. Nothing between her and the coastline below.",
        motion_intensity: 0.55,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman suspended from the wing strut, both arms extended fully horizontal at shoulder height — iron cross position, body perpendicular to the strut, face angled downward toward the coastline 3000 metres below. Skydiving harness visible. Wind flattens her top against her torso, hair whipped upward. She holds the iron cross — completely still above the void, both arms horizontal, looking directly down at the ocean below. Coast visible between her two outstretched arms. Holds position — five full beats. Head rises slowly — looks directly at the GoPro. Right hand releases the strut. Single left arm iron cross hold — body swings slightly in the wind. Right arm drops to her side. Holds two beats. Left hand releases. Body drops straight down below frame. Coastline far below, strut empty, wind.",
        dialogue: "[aircraft engine and wind throughout — rope creak under tension — complete silence during the hold — abrupt release — wind in freefall]"
      },
      {
        style: "mounted GoPro underside of aircraft wing angled downward toward strut, wing rivet lines upper frame, woman in iron cross below strut, Atlantic coastline 3000m below between her outstretched arms, white surf on dark rocks, turquoise shallows to deep ocean, no colour grading, candid extreme sport footage, high altitude hard sunlight, sharp wing shadow — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair whipped upward by wind, tanned skin, bare hands gripping strut"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Tractions dans le vide → lâcher',
    sortOrder: 8, suggestedDuration: 8,
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro on a fixed support pole adjacent to the horizontal bar, angled directly toward the bar and outward. Bar at centre frame — ocean and coastline 600 metres below visible behind and beneath it. Bar grip tape visible. Camera does not move — bar stays at same position in frame throughout.",
        motion_intensity: 0.54,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman hanging from the bar by both hands — dead hang, body straight, ocean 600 metres below her feet. She begins slow controlled pull-ups — three reps, chin to bar, controlled descent each time. On the third descent — hangs at full extension. Releases right hand — single left hand grip only, body swinging slightly in the wind off the platform, ocean directly below. Holds the single-hand hang — five full beats, hair pulled by wind, body swinging. Right hand does not return to the bar. She looks at the camera. Looks down at the ocean. Left hand releases. Drops below frame. Ocean behind the empty bar, motionless.",
        dialogue: "[wind throughout — exertion breath on each pull-up — silence during single-hand hold — long pause — release — wind in freefall]"
      },
      {
        style: "mounted GoPro on fixed support pole adjacent to bar, camera stationary throughout, horizontal bar centered in frame, ocean surface 600m below and behind bar visible, coastline background, no colour grading, candid extreme sport footage, hard midday sunlight — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair loose and wind-pulled, tanned skin, bare hands on bar grip tape, single left hand hold before release"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Highline entre 2 avions · bras levés · V1',
    sortOrder: 9, suggestedDuration: 10, conceptGroup: 'skydive-highline',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to wing strut of first aircraft, angled along the highline. Flat woven highline visible across open sky to second identical aircraft in tight formation 18 metres away. Below: ocean surface 3500 metres down, no land visible, horizon all directions. Woman already at midpoint of the line between both aircraft.",
        motion_intensity: 0.56,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman at midpoint of highline between the two aircraft — seated on the line, 3500 metres of open ocean below. She rises to standing on the line — arms out, absorbing the slipstream vibration with her knees. Stable. She raises both arms fully above her head — no balance assist — line vibrating under her feet in the slipstream. Holds three full beats above the void. Slowly lowers both arms to her sides. Looks directly at the GoPro on the wing strut. Looks down at the ocean 3500 metres below — long held beat. Sits back down on the line in one controlled motion. Then lies backward off the line — body tipping back slowly until she slips off. Drops below frame. Ocean below, line vibrating empty.",
        dialogue: "[aircraft engines from both sides throughout — slipstream wind — silence during standing hold — long pause looking down — quiet release — wind in freefall]"
      },
      {
        style: "mounted GoPro on wing strut angled along highline toward woman at midpoint, flat woven highline to second aircraft in formation, ocean surface 3500m below, no land visible, horizon all directions, second aircraft visible at line end, line vibrating in slipstream, no colour grading, candid extreme sport footage, high-altitude hard sunlight, sharp shadows — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair in tight braid whipped by slipstream, tanned skin, bare feet on line"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Highline entre 2 avions · traversée · V2',
    sortOrder: 10, suggestedDuration: 10, conceptGroup: 'skydive-highline',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to the wing strut of the first aircraft, angled outward along the highline toward the second aircraft. Flat woven highline stretches from this aircraft wing across 18 metres of open sky to a second identical aircraft flying in tight formation. Below: ocean surface 3500 metres down, no land visible, horizon in all directions. Second aircraft visible at the far end of the line, its wing strut, the line vibrating in the slipstream between them.",
        motion_intensity: 0.57,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman stands on the wing strut of the first aircraft, one hand on the fuselage, bare feet on the line. Steps off the strut onto the highline — full weight on the line, 18 metres of open sky below her to the ocean far below. Arms spread wide, balancing. Line vibrates in the slipstream — she absorbs it with her legs, small corrections. Reaches the midpoint — directly between both aircraft, nothing below for 3500 metres. Stops. Looks down at the ocean far below. Looks at the camera. Releases both arms to her sides — no balance assist. Three seconds. Sits down on the line. Then rolls off deliberately — hands release — drops below the line into open sky.",
        dialogue: "[aircraft engines from both sides throughout — slipstream wind — line vibration — silence as she drops — wind in freefall]"
      },
      {
        style: "mounted GoPro on wing strut angled along highline, flat woven highline across 18m of open sky to second aircraft in formation, ocean surface 3500m below, horizon all directions, second aircraft visible at line end, line vibrating in slipstream, no colour grading, candid extreme sport footage, high altitude hard sunlight, sharp aircraft shadows — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair in tight braid whipped by slipstream, tanned skin, bare feet on line"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: "Au téléphone accrochée à la porte de l'avion",
    sortOrder: 11, suggestedDuration: 10,
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro inside aircraft ceiling rail above open door, angled outward and downward. Open door fills right frame — woman hanging from the exterior door frame by both hands, body fully outside the aircraft, feet dangling in open air. Below: agricultural patchwork fields 4000 metres down, river bend, straight road. Aircraft interior left — jump seats, altitude meter reading 14000ft.",
        motion_intensity: 0.54,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman hanging from the exterior door frame by both hands, body outside the aircraft, feet in open air at 4000 metres. Wind rips hair forward across her face. She hangs completely still — entirely casual. Phone visible in her right hand, gripping the door frame with left hand only. She raises the phone to her ear — single hand on the door frame, body swinging slightly in the wind. Speaks into the phone, completely relaxed. Pause. Responds. Looks at the camera through the door. Looks down at the fields 4000 metres below. Holds the gaze down for two beats. Right hand drops the phone — it spins away below. Both hands now on the frame. Then releases both. Drops below frame. Empty doorway. Fields below. Wind.",
        dialogue: "[aircraft engine drone — wind roar outside — phone to ear]: 'Yeah, I'm here... I'm available.' — [pause] — 'No, I'm not falling... well, not yet.' — [phone drops — silence — wind]"
      },
      {
        style: "mounted GoPro ceiling rail inside Cessna, open door right frame, woman hanging exterior door frame by hands body fully outside, feet dangling at 4000m, agricultural fields below, river bend, straight road, interior jump seats and altitude meter 14000ft visible left, no colour grading, candid extreme sport footage, high-altitude sunlit daylight — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair braided and wind-ripped, tanned skin, phone in right hand during call"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Frappe au but plateforme → saute · V1',
    sortOrder: 12, suggestedDuration: 8, conceptGroup: 'skydive-football',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro at floor grating level, angled directly downward through the metal grating. Ocean surface visible 1200 metres below through the grate holes — tiny whitecaps visible on the water. Her football boots visible on the grating above the camera. Platform suspended beneath helicopter rigging cables. Cable-wire perimeter fence at platform edge visible.",
        motion_intensity: 0.57,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Football boots on the grating directly above camera — ocean 1200 metres below visible through the grate. She paces slowly toward the ball — each boot step on the grate, ocean visible with each step. Stops at the ball. Still. Run-up begins — boot impacts ring on the grating, ocean floor visible below with each stride. Full strike — boot passes over camera, ball launches. She stops at the platform edge, toes of boots at the cable wire perimeter. Looks down through the fence at the ocean below — three full beats. Steps up onto the low cable wire. Balances one beat. Steps off the platform edge forward. Figure drops below frame. Ocean surface far below, motionless.",
        dialogue: "[wind throughout — boot steps on metal grating — ball strike — long pause at the edge — wire flex — silence on drop — wind in freefall]"
      },
      {
        style: "mounted GoPro at grating floor level angled downward through metal grate, ocean surface 1200m below visible through grate holes, tiny whitecaps on water below, football boots on grating above camera, cable-wire perimeter fence at platform edge, helicopter rigging cables overhead, no colour grading, candid extreme sport footage, hard high-altitude midday light — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair braided, tanned skin, football boots on metal grating, sharp altitude shadows"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'But + célébration → saute · V2',
    sortOrder: 13, suggestedDuration: 8, conceptGroup: 'skydive-football',
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro on vertical goalpost, fixed at crossbar height, angled outward toward the pitch and beyond. Small elevated platform 12 metres long, metal grating floor, low cable-wire fence perimeter, full-size goal behind the camera. Below the platform edges on all sides: sheer vertical drop to ocean surface visible far below, coastline in the extreme distance. Platform suspended beneath helicopter rigging cables visible at top of frame.",
        motion_intensity: 0.57,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman stands 8 metres back on the metal grating platform, ball at her feet. She looks directly into the camera. Short deliberate run-up — plant foot hits the grating with a metallic ring. Full strike. Ball rockets toward camera — crosses above the crossbar and disappears behind the camera mount. She raises both arms — celebration, turning to face the open void beyond the cable fence. Looks down over the edge — ocean far below. Steps up onto the low cable wire, both feet on it, balancing. One step forward off the wire — drops clean off the platform edge. Figure shrinks fast against the ocean backdrop far below.",
        dialogue: "[wind throughout — metallic ring of boot on grating — ball strike — brief celebration sound — wind dominant on drop]"
      },
      {
        style: "mounted GoPro at crossbar height angled outward, small suspended metal grating platform, cable-wire perimeter fence, helicopter rigging cables visible overhead, sheer vertical drop to ocean surface far below on all sides, coastline extreme background distance, no colour grading, candid extreme sport footage, high-altitude hard sunlight — woman blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair braided, tanned skin, football boots on metal grating, sharp altitude shadows"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Espresso sur chaise au bord → bascule',
    sortOrder: 14, suggestedDuration: 8,
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to the chair itself at seat level, angled outward toward the woman and the void beyond. Wooden chair placed at the very lip of a granite cliff edge — chair legs at the extreme edge, nothing beyond but 600 metres of open air to a river valley floor below. Valley floor, river and forest visible in full below the chair edge.",
        motion_intensity: 0.52,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman seated in the chair, back straight, legs crossed. She holds a white espresso cup. Takes a slow sip. Sets it carefully on her knee. Looks out at the valley below — 600 metres of open air directly in front of her, river visible. Looks at the camera. Uncrosses her legs. Places both feet flat on the cliff edge — toes over the lip. Slowly leans the chair backward on its rear legs — front legs lifting — valley rotating into view below as the chair tips past the point of balance — drops backward off the edge. Chair and figure fall. Valley below stationary.",
        dialogue: "[wind — espresso cup ceramic sound — silence — chair scrape on granite — wind in freefall]"
      },
      {
        style: "mounted GoPro on chair at seat level angled outward, wooden chair at granite cliff lip, 600m drop to river valley below directly in front, river and forest floor visible, no colour grading, candid extreme sport footage, afternoon sunlight, long cliff shadows — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair loose, tanned skin, bare feet on granite edge, small white espresso cup"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: 'Salto vrille depuis la planche',
    sortOrder: 15, suggestedDuration: 8,
    promptJson: JSON.stringify([
      {
        framing: "Mounted GoPro fixed to the plongeoir board itself, angled outward toward the woman and beyond. Board extends from cliff edge 700 metres above a turquoise bay. Board tip foreground — nothing below it but vertical cliff face and bay surface far down. Opposite coastline visible at horizon level.",
        motion_intensity: 0.58,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman stands at the end of the board, toes over the edge, looking out at the bay below. Wind pulls her hair sideways. She raises her arms horizontally — diver's stance. Looks down at the water 700 metres below. Looks up. One small bounce on the board — testing flex. Full bounce — launches up and forward off the board tip, clearing the board cleanly, body arching backward into a layout position above the void, bay visible directly below her. Begins a slow axis rotation — full body vrille, one complete revolution, bay and cliff alternating. Figure drops away, bay below.",
        dialogue: "[wind throughout — board flex creak on bounce — brief silence at the peak — wind in freefall building]"
      },
      {
        style: "mounted GoPro on board angled outward, board tip foreground with toes at edge, vertical cliff face below, turquoise bay 700m below, opposite coastline at horizon, no colour grading, candid extreme sport footage, direct sunlight casting hard shadow on board, sharp blue sky — blue and grey skydiving harness over fitted deep V-neck athletic top showing prominent cleavage, dark hair loose and wind-pulled, tanned skin, bare feet on board grip surface"
      }
    ])
  },

  {
    niche: 'skydive', subNiche: 'skydive',
    title: "Wing walker rotation → lâcher",
    sortOrder: 16, suggestedDuration: 8,
    promptJson: JSON.stringify([
      {
        framing: "Extreme close mounted POV camera fixed on the aircraft wing strut, low three-quarter angle looking back at a wing-walker against open sky. Below stretches a vertical aerial view of turquoise ocean, white-sand coastline, a lagoon and distant eroded headland township, wing tip reading 'DO NOT STEP' visible in the lower frame corner, no other passengers in view.",
        motion_intensity: 0.58,
        action: "CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Woman kneels gripping the wing strut. Wind rips braided hair forward. She tips backward along the bar. Body rotates inverted around strut. Hair falls loose upside down. Full rotation continues past horizon. She hangs suspended by both hands. Legs kick free in the wind. Head tips back, mouth bursts open laughing. Grip releases from the bar. Body drops away from the wing. Figure shrinks into freefall below. Frame holds steady over empty coastline.",
        dialogue: "[Ambient wind roar and distant engine drone throughout — brief laugh before release — silence on drop]"
      },
      {
        style: "Extreme close mounted GoPro-style POV, low three-quarter angle, wing strut foreground with 'DO NOT STEP' aircraft wing tip, aerial turquoise coastline backdrop, no colour grading, candid extreme-sport footage — blue and grey skydiving harness over light bikini top, blonde hair in a tight braid whipped loose by wind, tanned skin, sunlit high-altitude daylight, sharp hard shadows, faint jet contrail in clear blue sky"
      }
    ])
  },
]

// ─── Upsert ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding ${PROMPTS.length} prompts (moto/skydive/mma/prank + compléments)...\n`)
  let created = 0
  let updated = 0

  for (const p of PROMPTS) {
    const phraseVariationsJson = p.phraseVariations ? JSON.stringify(p.phraseVariations) : null
    const existing = await prisma.validatedPrompt.findFirst({ where: { title: p.title } })

    const data = {
      promptJson: p.promptJson,
      outfitText: p.outfitText ?? null,
      speakerLine: p.speakerLine ?? null,
      phraseVariations: phraseVariationsJson,
      conceptGroup: p.conceptGroup ?? null,
      suggestedDuration: p.suggestedDuration,
      isBest: p.isBest ?? false,
      sortOrder: p.sortOrder ?? 0,
    }

    if (existing) {
      await prisma.validatedPrompt.update({ where: { id: existing.id }, data })
      updated++
      console.log(`  ↻ Updated: [${p.niche}] ${p.title}`)
    } else {
      await prisma.validatedPrompt.create({
        data: { niche: p.niche, subNiche: p.subNiche, title: p.title, ...data },
      })
      created++
      console.log(`  + Created: [${p.niche}] ${p.title}`)
    }
  }

  console.log(`\n✅ Done — ${created} créés, ${updated} mis à jour\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
