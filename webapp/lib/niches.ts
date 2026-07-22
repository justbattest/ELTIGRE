/**
 * Source de vérité unique pour les niches vidéo.
 *
 * Deux granularités distinctes :
 * - SAVE_CATEGORIES : catégories sélectionnables au save d'un prompt (Prompt Lab) —
 *   granularité subNiche complète (nurse et restaurant sont séparés, etc.)
 * - STATIC_VIDEO_TABS : onglets statiques de la page Videos — granularité onglet
 *   (vieux regroupe nurse+restaurant, meteo regroupe meteo+reporter)
 *
 * Les niches custom (créées par les utilisateurs via Prompt Lab) ne vivent pas ici :
 * elles sont découvertes dynamiquement en DB par GET /api/video/niches
 * (toute niche hors KNOWN_DB_NICHES est custom).
 */

export type SaveCategory = { key: string; niche: string; subNiche: string; label: string }
export type VideoTab = { tabKey: string; dbNiche: string; label: string; emoji: string; isCustom?: boolean }

export const SAVE_CATEGORIES: SaveCategory[] = [
  { key: 'conference', niche: 'conference_sport', subNiche: 'conference', label: '🎓 Conference' },
  { key: 'sport',      niche: 'conference_sport', subNiche: 'sport',      label: '🏃 Coach' },
  { key: 'golf',       niche: 'golf',       subNiche: 'golf',       label: '⛳ Golf' },
  { key: 'nurse',      niche: 'vieux',      subNiche: 'nurse',      label: '🏥 Elderly — Nurse' },
  { key: 'restaurant', niche: 'vieux',      subNiche: 'restaurant', label: '🍽️ Elderly — Restaurant' },
  { key: 'meteo',      niche: 'meteo',      subNiche: 'meteo',      label: '📺 Weather' },
  { key: 'reporter',   niche: 'meteo',      subNiche: 'reporter',   label: '🌪️ Weather — Reporter' },
  { key: 'serveuse',   niche: 'serveuse',   subNiche: 'serveuse',   label: '🍾 Waitress' },
  { key: 'mcdo',       niche: 'mcdo',       subNiche: 'mcdo',       label: '🍔 McDo' },
  { key: 'skatepark',  niche: 'skatepark',  subNiche: 'skatepark',  label: '🛴 Skatepark' },
  { key: 'standdetir', niche: 'standdetir', subNiche: 'standdetir', label: '🎯 Shooting Range' },
  { key: 'moto',       niche: 'moto',       subNiche: 'moto',       label: '🏍️ Moto' },
  { key: 'skydive',    niche: 'skydive',    subNiche: 'skydive',    label: '🪂 Skydive' },
  { key: 'mma',        niche: 'mma',        subNiche: 'mma',        label: '🥋 MMA' },
  { key: 'prank',      niche: 'prank',      subNiche: 'prank',      label: '🎭 Pranks' },
]

export const STATIC_VIDEO_TABS: VideoTab[] = [
  { tabKey: 'conference', dbNiche: 'conference_sport', label: 'Conference', emoji: '🎓' },
  { tabKey: 'sport',      dbNiche: 'conference_sport', label: 'Coach',      emoji: '🏃' },
  { tabKey: 'golf',       dbNiche: 'golf',       label: 'Golf',           emoji: '⛳' },
  { tabKey: 'vieux',      dbNiche: 'vieux',      label: 'Old',            emoji: '👴' },
  { tabKey: 'meteo',      dbNiche: 'meteo',      label: 'Weather',        emoji: '📺' },
  { tabKey: 'serveuse',   dbNiche: 'serveuse',   label: 'Waitress',       emoji: '🍾' },
  { tabKey: 'mcdo',       dbNiche: 'mcdo',       label: 'McDo',           emoji: '🍔' },
  { tabKey: 'skatepark',  dbNiche: 'skatepark',  label: 'Skatepark',      emoji: '🛴' },
  { tabKey: 'standdetir', dbNiche: 'standdetir', label: 'Shooting Range', emoji: '🎯' },
  { tabKey: 'moto',       dbNiche: 'moto',       label: 'Moto',           emoji: '🏍️' },
  { tabKey: 'skydive',    dbNiche: 'skydive',    label: 'Skydive',        emoji: '🪂' },
  { tabKey: 'mma',        dbNiche: 'mma',        label: 'MMA',            emoji: '🥋' },
  { tabKey: 'prank',      dbNiche: 'prank',      label: 'Pranks',         emoji: '🎭' },
]

/** Toutes les niches DB "built-in" — tout ce qui est en dehors est une niche custom. */
export const KNOWN_DB_NICHES: string[] = [...new Set(STATIC_VIDEO_TABS.map(t => t.dbNiche))]
