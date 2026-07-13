/**
 * journey.ts — Le parcours de création d'une modèle IA, de A à Z.
 *
 * Source unique de vérité du "step-by-step" Modelify. Sert à la fois de :
 *   1. Spec vivante (ce qu'on doit construire + comment)
 *   2. Données rendues par /parcours (overview) et /parcours/[step] (détail)
 *
 * 100% front-end — aucune dépendance base de données. On branche le code réel
 * étape par étape ensuite. Mettre à jour les `status` au fur et à mesure.
 */

export type Status = 'done' | 'partial' | 'todo'

export type ChecklistItem = {
  /** id stable — sert de clé localStorage pour cocher visuellement */
  id: string
  label: string
  /** détail / note anti-ban / précision technique */
  hint?: string
}

export type Tool = {
  label: string
  /** route interne existante dans l'app, ou null si à construire */
  href: string | null
  status: Status
}

export type Step = {
  /** numéro d'étape 1..6 */
  n: number
  /** slug d'URL : /parcours/[slug] */
  slug: string
  title: string
  /** sous-titre court affiché sous le titre */
  tagline: string
  /** objectif de l'étape en une phrase */
  goal: string
  emoji: string
  status: Status
  /** checklist concrète de l'étape (cochable côté UI via localStorage) */
  checklist: ChecklistItem[]
  /** outils de l'app branchés sur cette étape (existants ou à construire) */
  tools: Tool[]
  /** ce qu'il reste à construire pour automatiser l'étape dans Modelify */
  toBuild: string[]
}

export const STATUS_META: Record<Status, { label: string; dot: string; text: string; ring: string; chip: string }> = {
  done:    { label: 'Fait',      dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-500/30', chip: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
  partial: { label: 'Partiel',   dot: 'bg-amber-400',   text: 'text-amber-300',   ring: 'ring-amber-500/30',   chip: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
  todo:    { label: 'À faire',   dot: 'bg-zinc-500',    text: 'text-zinc-400',    ring: 'ring-white/10',       chip: 'bg-white/[0.04] border-white/10 text-zinc-400' },
}

export const STEPS: Step[] = [
  {
    n: 1,
    slug: 'creer-les-comptes',
    title: 'Créer les comptes',
    tagline: 'Gmail · Instagram (créer ou acheter) · Fanvue · téléphone',
    goal: "Monter l'identité complète de la fille AVANT de générer — proprement, sans se faire ban.",
    emoji: '📱',
    status: 'partial',
    checklist: [
      { id: 's3-gmail', label: 'Créer le Gmail dédié (email racine du modèle)', hint: 'Numéro via TextVerified si demandé · PAS de Wi-Fi déjà brûlé' },
      { id: 's3-ig', label: 'Créer OU acheter le compte Instagram', hint: "Création : avec le Gmail · SANS numéro perso · en 4G/5G. Achat : compte aged déjà chauffé (réduit le risque de ban au démarrage)." },
      { id: 's3-fanvue', label: 'Créer le compte Fanvue' },
      { id: 's3-phone', label: 'Noter quel téléphone physique est rattaché à quel compte' },
      { id: 's3-unique', label: 'Vérifier : identité unique par compte (anti-ban)' },
    ],
    tools: [
      { label: 'Comptes Instagram', href: '/poster', status: 'partial' },
      { label: 'Gestionnaire d\'identités modèles', href: null, status: 'todo' },
      { label: 'Intégration TextVerified (numéro/SMS jetable)', href: null, status: 'todo' },
      { label: 'Checklist anti-ban interactive', href: null, status: 'todo' },
    ],
    toBuild: [
      'Gestionnaire d\'identités : Gmail / IG / Fanvue / téléphone liés par modèle',
      'Intégration API TextVerified (commander un numéro + récupérer le code SMS sans quitter Modelify)',
      'Checklist anti-ban guidée à la création (téléphone, réseau mobile vs Wi-Fi, unicité)',
      'Flux "acheter un compte IG aged" (sources + vérif chauffe) en plus de la création',
      'Mapping visuel téléphone ↔ comptes (quelle SIM / quel device pour quelle fille)',
    ],
  },
  {
    n: 2,
    slug: 'creer-le-modele',
    title: 'Créer le modèle',
    tagline: 'Set de référence cohérent depuis une ancre (Nano Banana i2i)',
    goal: "Générer le set de photos cohérentes de la fille (la recette Miraya), réutilisable comme identité.",
    emoji: '🧬',
    status: 'partial',
    checklist: [
      { id: 's1-anchor', label: 'Verrouiller une ancre adulte (visage qui lit clairement la mi-vingtaine)', hint: 'Bloquant Fanvue/Meta · le trait signature (1 seul grain) défini ici' },
      { id: 's1-photos', label: 'Générer le set de référence depuis l\'ancre (≈30 : 20 lifestyle + 10 chambre)', hint: 'Page « Créer le modèle » : prompts Claude i2i → moteur Nano Banana en image-to-image' },
      { id: 's1-check', label: 'Vérifier chaque image (même identité · 1 grain · lit adulte · bonne scène)' },
      { id: 's1-regen', label: 'Régénérer les images KO une par une' },
      { id: 's1-identity', label: 'Définir le nom de la modèle + son avatar' },
    ],
    tools: [
      { label: 'Créer le modèle (set de référence)', href: '/creer-modele', status: 'done' },
      { label: 'Prompt Studio (génération images)', href: '/studio', status: 'done' },
      { label: 'Bulk Edit (Seedream 4.5)', href: '/bulk-edit', status: 'done' },
      { label: 'Motion / face-swap (mc-prep)', href: '/motion-control', status: 'partial' },
      { label: 'Gestionnaire d\'identité modèle', href: null, status: 'todo' },
    ],
    toBuild: [
      'Sauvegarde du set + ancre par modèle (entité Modèle qui agrège identité + avancement des 6 étapes)',
      'Auto-check des images (identité / grain unique / scène) + relance auto des KO',
      'Couche "Characters" : auto-injecter l\'ancre comme référence à chaque génération (remplace le @perso Higgsfield)',
      'Bascule moteur ModelArk/Seedream 4.5 en direct (drop Higgsfield) pour la génération en volume',
    ],
  },
  {
    n: 3,
    slug: 'generer-le-contenu',
    title: 'Générer le contenu',
    tagline: 'Images & vidéos depuis le modèle',
    goal: 'Produire du contenu (images, carrousels, vidéos 9:16) prêt à poster depuis le modèle.',
    emoji: '🎬',
    status: 'partial',
    checklist: [
      { id: 's2-img', label: 'Générer des images (Prompt Studio / Bulk Edit)' },
      { id: 's2-carousel', label: 'Créer des carrousels' },
      { id: 's2-video', label: 'Générer des vidéos (prompts winners Seedance 2.0 / Kling 3.0)' },
      { id: 's2-promptlab', label: 'Reproduire un reel via Prompt Lab (screenshots → prompt Claude)' },
      { id: 's2-meta', label: 'Nettoyer la metadata (QTables Apple + ICC sRGB)' },
      { id: 's2-spoof', label: 'Spoofer le contenu → prêt pour post en trial' },
    ],
    tools: [
      { label: 'Prompt Studio (bulk images)', href: '/studio', status: 'done' },
      { label: 'Bulk Edit (Seedream 4.5)', href: '/bulk-edit', status: 'done' },
      { label: 'Carrousels', href: '/carousel', status: 'done' },
      { label: 'Vidéos (Seedance / Kling)', href: '/video', status: 'done' },
      { label: 'Prompt Lab', href: '/prompt-lab', status: 'done' },
      { label: 'Metadata cleaner', href: '/metadata', status: 'done' },
      { label: 'Spoofer', href: '/spoofer', status: 'partial' },
    ],
    toBuild: [
      'Affichage du coût en crédits (images ET vidéos) avant génération',
      'Mode de génération "aléatoire" (en plus de exact / variation légère)',
      'Routing Kling 3.0 complet (5× moins cher) selon la complexité',
      'Filtrage de tout le contenu par modèle courant',
      'Bank de poses enregistrées → carrousels à partir de poses',
    ],
  },
  {
    n: 4,
    slug: 'lancer-instagram',
    title: 'Lancer Instagram + Fanvue',
    tagline: 'Warmup · posting · redirection trafic',
    goal: 'Démarrer le compte sans ban, poster, et rediriger le trafic vers Fanvue.',
    emoji: '🚀',
    status: 'partial',
    checklist: [
      { id: 's4-warmup', label: 'Warmup du compte (anti-ban, mini-scroll, varier les patterns)' },
      { id: 's4-post', label: 'Auto-posting (main feed / trial reels — en 2 temps selon approbation Meta)' },
      { id: 's4-bio', label: 'Mettre le link-in-bio → Fanvue' },
      { id: 's4-status', label: 'Suivre le statut du compte (warmup / actif / challenge / ban)' },
    ],
    tools: [
      { label: 'Poster (auto-posting IG)', href: '/poster', status: 'partial' },
      { label: 'Phone farm + auto-warmup', href: null, status: 'todo' },
      { label: 'Link in bio (→ Fanvue)', href: null, status: 'todo' },
      { label: 'Tracking comptes IG', href: '/kpi', status: 'partial' },
    ],
    toBuild: [
      'Phone farm : connexion des devices + auto-warmup (éviter de répéter les mêmes patterns)',
      'Link-in-bio (style getallmylinks / link.me) avec redirection Fanvue + nom de domaine optionnel',
      'Auto-push main feed / trial reels en 2 temps (avant/après approbation Meta)',
      'Tableau de statut des comptes (best performing + santé du compte)',
    ],
  },
  {
    n: 5,
    slug: 'monetisation',
    title: 'Monétisation',
    tagline: 'Du trafic Fanvue à l\'encaissement',
    goal: "Convertir le trafic en revenu — chatting délégué à l'équipe de Tristan (25%).",
    emoji: '💸',
    status: 'todo',
    checklist: [
      { id: 's5-traffic', label: 'Trafic IG → Fanvue actif et mesuré' },
      { id: 's5-subs', label: 'Abonnements Fanvue qui rentrent' },
      { id: 's5-chat', label: 'Chatting pris en charge par l\'équipe de Tristan (25% / modèle)' },
      { id: 's5-cashin', label: 'Suivre les encaissements jusqu\'au versement' },
    ],
    tools: [
      { label: 'Suivi des revenus entrants', href: null, status: 'todo' },
      { label: 'Connexion Fanvue (si API dispo)', href: null, status: 'todo' },
      { label: 'Saisie manuelle des revenus', href: null, status: 'todo' },
    ],
    toBuild: [
      'Suivi des revenus par modèle (saisie manuelle au minimum, API Fanvue si dispo)',
      'Répartition automatique (part chatting 25%, part équipe, net)',
      'Historique des encaissements jusqu\'au versement',
    ],
  },
  {
    n: 6,
    slug: 'dashboard-revenus',
    title: 'Dashboard revenus',
    tagline: 'Combien chaque modèle rapporte',
    goal: 'Voir, par modèle et par mois, le revenu net — et le P&L (revenu vs coûts crédits).',
    emoji: '📊',
    status: 'todo',
    checklist: [
      { id: 's6-permodel', label: 'Revenu net par modèle' },
      { id: 's6-permonth', label: 'Revenu par mois / évolution' },
      { id: 's6-pnl', label: 'P&L : revenu vs coûts (crédits Higgsfield, outils)' },
      { id: 's6-rank', label: 'Classement des modèles les plus rentables' },
    ],
    tools: [
      { label: 'KPI (embryon)', href: '/kpi', status: 'partial' },
      { label: 'Dashboard revenus par modèle', href: null, status: 'todo' },
    ],
    toBuild: [
      'Dashboard revenus par modèle (mensuel + cumulé, net)',
      'P&L par fille : revenu encaissé moins coûts de génération',
      'Vue portfolio : toutes les modèles, leur statut et leur rentabilité d\'un coup d\'œil',
    ],
  },
]

/** Modules de la roadmap Tristan qui sont transverses (pas une étape unique du parcours). */
export const TRANSVERSE = [
  { label: 'Trend Hunter', desc: 'Analyse de marché data-based (style Minea / onlystats.ai) — IG reels puis TikTok / Threads / X', status: 'todo' as Status },
  { label: 'Extension Chrome', desc: 'Se balader sur IG (PC), cliquer un reel/carrousel pour le reproduire avec sa modèle + trier par nombre de vues', status: 'todo' as Status },
  { label: 'AI version de Tristan', desc: 'Chatbot coaching nourri du savoir de Tristan, pour retenir les abonnés', status: 'todo' as Status },
  { label: 'Course OFM intégré', desc: 'Formation OFM intégrée dans le soft pour apprendre', status: 'partial' as Status },
  { label: 'Upscaler', desc: 'Améliorer la résolution des images/vidéos (style enhancor.ai / magnific.com)', status: 'todo' as Status },
]

export function getStep(slug: string): Step | undefined {
  return STEPS.find(s => s.slug === slug)
}
