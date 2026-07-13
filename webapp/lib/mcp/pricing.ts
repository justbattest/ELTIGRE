/**
 * Modelify MCP — tarification en crédits par outil. SOURCE UNIQUE DE VÉRITÉ.
 *
 * MODÈLE (repris de PetitPanda `src/lib/credit-costs.ts`) :
 *   Chaque action facturée coûte ~20× le coût marginal réel en compute
 *   (génération d'image/vidéo Higgsfield/Gemini, etc.). L'abonnement couvre
 *   les coûts fixes ; les coûts variables sont récupérés via les crédits.
 *   Valeur faciale : 1 crédit ≈ $0.10.
 *
 * RÈGLE pour ajouter un outil facturé :
 *   1. Estimer le coût marginal pire cas en USD.
 *   2. credits = ceil(cost_usd * 20 / 0.10)  (toujours arrondir au-dessus)
 *   3. Ajouter une entrée ci-dessous avec un commentaire justifiant le coût.
 *
 * Les outils en lecture seule (read-only) coûtent 0.
 */

export const TOOL_CREDIT_COSTS: Record<string, number> = {
  // ── Génération d'images (set de référence / studio) ─────────────────────
  /**
   * Génère un set de référence cohérent (~20 images i2i Nano Banana 2).
   * Coût ~$0.02/img × 20 ≈ $0.40. 20× → ~$8.00 → 80 crédits.
   */
  modelify_generate_reference_set: 80,
  /**
   * Améliore/upscale un set existant (re-render i2i, ~10 images 2K-4K).
   * Coût ~$0.04/img × 10 ≈ $0.40. 20× → ~$8.00 → 80 crédits.
   */
  modelify_enhance_set: 80,
  /**
   * Batch studio : génération en lot d'images stylisées (~12 images 2K).
   * Coût ~$0.04/img × 12 ≈ $0.48. 20× → ~$9.60 → 96 crédits.
   */
  modelify_studio_batch: 96,
  /**
   * Édition en lot (swap outfit/scène) sur plusieurs images (~10 images i2i).
   * Coût ~$0.02/img × 10 ≈ $0.20. 20× → ~$4.00 → 40 crédits.
   */
  modelify_bulk_edit: 40,

  // ── Génération vidéo ────────────────────────────────────────────────────
  /**
   * Génère une vidéo (Seedance 2.0, 9:16, 720p, ~5s).
   * Coût ~$0.30/clip. 20× → ~$6.00 → 60 crédits.
   */
  modelify_generate_video: 60,
  /**
   * Motion control (chains, transfert de mouvement sur une frame).
   * Coût ~$0.35/clip. 20× → ~$7.00 → 70 crédits.
   */
  modelify_motion_control: 70,

  // ── Carrousels ──────────────────────────────────────────────────────────
  /**
   * Crée un carrousel (génération multi-slides, ~8 images i2i).
   * Coût ~$0.02/img × 8 ≈ $0.16. 20× → ~$3.20 → 32 crédits.
   */
  modelify_create_carousel: 32,
  /**
   * Variations d'un carrousel existant (re-render de quelques slides, ~6 img).
   * Coût ~$0.02/img × 6 ≈ $0.12. 20× → ~$2.40 → 24 crédits.
   */
  modelify_carousel_variations: 24,

  // ── Post-traitement / métadonnées / anti-détection ──────────────────────
  /**
   * "Spoof" métadonnées (réécriture EXIF/ICC/qtables, compute local CPU).
   * Coût marginal négligeable mais on facture un minimum symbolique. 1 crédit.
   */
  modelify_spoof: 1,
  /**
   * Optimise les métadonnées d'un post (caption/hashtags via LLM texte).
   * Coût ~$0.002. 20× → ~$0.04 → 1 crédit (minimum).
   */
  modelify_optimize_metadata: 1,

  // ── Publication ─────────────────────────────────────────────────────────
  // modelify_schedule_instagram_post : GRATUIT (pas de compute IA marginal).
  // Le handler accounts.ts ne débite pas → on ne déclare PAS de coût ici
  // (costOf renvoie 0 par défaut). Cohérence barème ↔ handler garantie.
}

/**
 * Coût en crédits d'un outil. 0 pour tout outil non listé (lecture seule :
 * get_run, get_results, list_models, etc.).
 */
export function costOf(toolName: string): number {
  return TOOL_CREDIT_COSTS[toolName] ?? 0
}
