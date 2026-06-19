/**
 * Update suggestedDuration for all 74 validated prompts
 * Based on rigorous analysis of each promptJson (number of shots, dialogue length, action complexity)
 *
 * Run: npx tsx scripts/update-prompt-durations.ts
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DURATIONS: Record<string, number> = {
  // ── CONFERENCE (17 prompts) ──────────────────────────────────────────────
  'P2 — Inauguration · Culotte + chuchoteur + cameraman':                8,
  'P3-V1 — Auditorium · Single shot · Garçon filme + gifle':            7,
  'P3-V2 — Auditorium · Multi-shot · Meilleure culotte':                8,
  'P3-V3 — Auditorium · Triangle central géométrique':                  8,
  'P4-A — Assise sous table · Cameraman pan · Meilleure scène':         7,
  'P4-B — Assise sous table · Meilleure culotte':                       7,
  'P4-C — Assise sous table · Triangle minimaliste':                    6,
  'P5-V1 — Dos au public · Culotte triangle · Gifle copine':            7,
  'P5-V2 — Dos au public · Meilleure scène globale':                    8,
  'P5-V5 — Dos au public · MEILLEURE globalement':                      9,
  'P28 — Stage mic · Below angle · Beige underwear · "Great leaders"':  8,
  'P29 — Stage mic · Below angle · Black underwear · "Every eye"':      8,
  'P30 — Stage mic · Below angle · White underwear · "Open up" (sensible)': 8,
  'P31 — Auditorium · Cream blouse · Dos au public · Wrist grab copine': 8,
  'P32 — Harvard panel assis · White underwear · Variante P4':          7,
  'P24 — Mec glisse de sa chaise · PARFAIT 10/10':                     8,
  'P25 — Mec tombe violemment · Variation P24':                        8,

  // ── SPORT (7 prompts) ────────────────────────────────────────────────────
  'P18 — Kiné terrain · Stiff down there · PARFAIT':                   8,
  'P19 — Coach piste · Who the fuck said that · MEILLEUR':             8,
  'P20 — Coach piste · Variation minimaliste':                         7,
  'P21 — Cool down · Bras levés + penché · PARFAIT':                   8,
  'P22 — Cool down · Variation réactions élèves':                      8,
  'P23 — Cool down · Variation minimaliste':                           7,
  'P26 — Volleyball · Coach défensive · Casi parfait':                 7,

  // ── GOLF (3 prompts) ─────────────────────────────────────────────────────
  'P1 — Golf · Swing de dos · Punchline gâteau · MEILLEUR':           10,
  'P6 — Golf · Face caméra · Cart tombe dans l\'étang · V3 PARFAITE': 9,
  'P27 — Golf · Flagstick pull · Birdie misunderstanding':             7,

  // ── NURSE / VIEUX (9 prompts) ────────────────────────────────────────────
  'P7 — Terrasse restaurant · Lèche la joue':                          6,
  'P8 — Terrasse restaurant · Lèche la bouche · MEILLEURE':           7,
  'P9 — Nursing home · Massage pieds cuisses · PARFAIT':               6,
  'P10 — Hôpital · Vieux par terre · Tête cuisses · Résignée':        6,
  'P11 — Hôpital · Vieux se relève · Face cuisses · Sourit':          6,
  'P12 — Hôpital · Vieux à 4 pattes · Tête entre jambes':            6,
  'P13 — Hôpital · Se relève seul · Face cuisses · Grand sourire':    7,
  'P14 — Hôpital · Infirmière sur lit · Vieux caresse · PARFAIT':    6,
  'P15 — Fauteuil roulant · Album photos · Dialogue lui':              7,
  'P16 — Fauteuil roulant · Album photos · Dialogue elle':             7,
  'P17 — Fauteuil roulant · Album photos · MEILLEUR triangle rouge':  7,

  // ── MÉTÉO / REPORTER (4 prompts) ─────────────────────────────────────────
  'P33 — Météo Studio · John noue le ruban · Jupe s\'ouvre · MEILLEUR': 8,
  'P34 — Météo Studio · John tire le lacet · Jupe menace de tomber':    8,
  'P35 — Reporter storm · Please stay home · Culotte rouge (originale)': 9,
  'P36 — Reporter storm · DÉLUGE · Culotte beige nude · MEILLEURE':    10,

  // ── SERVEUSE (9 prompts) — ALL 12s ───────────────────────────────────────
  'S1 — "Sex on the Beach" · Deadpan · 12s min':                      12,
  'S2 — "Screaming Orgasm" · Shot deadpan · 12s min':                 12,
  'S3 — "Blow Job" shot · Instructions pro · 12s min':                12,
  'S4 — "Slippery Nipple" · Addition sans réponse · 12s min':         12,
  'S5 — Éclair · Avale tout · Choke · "Vanilla options" · 12s min':  12,
  'S6 — Éclair · Grosse bouchée · Choke · Recover · MEILLEUR · 12s min': 12,
  'S7 — Soupe froide · Boire directement · "I\'ll have that warmed up" · 12s min': 12,
  'S8 — Steak saignant · Goûter à mains nues · "Medium-rare" · 12s min': 12,
  'S9 — "Extra cream" · Crème partout visage · Recover · 12s min':   12,

  // ── SKATEPARK (7 prompts) ────────────────────────────────────────────────
  'SK1 — Scooter · No-hander quarterpipe · Version originale':         6,
  'SK2 — Scooter · No-hander quarterpipe · Real-time speed':          6,
  'SK3 — Scooter · 360 spin · Version originale':                      7,
  'SK4 — Scooter · 360 spin · No slow motion':                         6,
  'SK5 — Scooter · 360 spin · Real-time speed':                        7,
  'SK6 — Scooter · Halfpipe massive air · Version originale':          8,
  'SK7 — Scooter · Halfpipe massive air · Real-time speed (BANGER)':  8,

  // ── McDO (16 prompts) ────────────────────────────────────────────────────
  'MC1 — McDo · Concept original · Reconnue sur Instagram (Nina)':     8,
  'MC2 — McDo · Don\'t forget your sauce · Déflection prénom':        6,
  'MC3 — McDo · Enjoy your meat · Deadpan':                            7,
  'MC4 — McDo · Something extra · Tease subtil':                       7,
  'MC5 — McDo · Hot and ready · Slow smile':                           7,
  'MC6 — McDo · Go large · Slow smile':                                7,
  'MC7 — McDo · Two hands · Slight smile':                             7,
  'MC8 — McDo · Still hot · Wink':                                     7,
  'MC9 — McDo · Everything to be satisfied · Sweetheart':              7,
  'MC10 — McDo · Hot apple pie · Slow blink':                          7,
  'MC11 — McDo · Last order of the night':                             7,
  'MC12 — McDo · Free upgrade · Elle joue le jeu':                    7,
  'MC13 — McDo · Anything else I can do · Ambiguïté maximale':        8,
  'MC14 — McDo · Special sauce · Deadpan':                             7,
  'MC15 — McDo · Keep you warm · Deliberate look':                    7,
  'MC16 — McDo · Freshly made · Ending ambigu':                       8,
}

async function main() {
  console.log(`Updating suggestedDuration for ${Object.keys(DURATIONS).length} prompts...`)

  let updated = 0
  let notFound = 0

  for (const [title, duration] of Object.entries(DURATIONS)) {
    const result = await prisma.validatedPrompt.updateMany({
      where: { title },
      data: { suggestedDuration: duration },
    })
    if (result.count > 0) {
      updated += result.count
      console.log(`  ✓ [${duration}s] ${title.slice(0, 60)}`)
    } else {
      notFound++
      console.warn(`  ⚠️  NOT FOUND: ${title}`)
    }
  }

  console.log(`\nDone: ${updated} updated, ${notFound} not found`)
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
