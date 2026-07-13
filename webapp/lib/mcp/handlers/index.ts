/**
 * Modelify MCP — agrégation des modules de handlers.
 *
 * `tools.ts` importe ce fichier et combine tous les modules en un seul registre.
 * Chaque domaine fonctionnel exporte un `ToolModule` (voir `registry.ts`).
 *
 * ┌─ Phase 2 (fait) ───────────────────────────────────────────────────────┐
 * │  coreTools — outils génériques (get_user, list_models, list_runs,       │
 * │              get_run, get_results). Voir `./core.ts`.                    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Phase 3 (à faire) ────────────────────────────────────────────────────┐
 * │  Créer les fichiers et remplacer chaque stub vide ci-dessous par le     │
 * │  vrai module :                                                          │
 * │    - ./content.ts  → contentTools  (génération : reference_set, studio, │
 * │                       video, carousel… scope content:generate)          │
 * │    - ./accounts.ts → accountTools  (comptes IG/Fanvue, schedule…        │
 * │                       scopes accounts:read / accounts:write)            │
 * │    - ./revenue.ts  → revenueTools  (revenus des modèles, KPIs…)         │
 * │                                                                          │
 * │  Squelette d'un fichier Phase 3 :                                       │
 * │    import type { ToolModule } from '../registry'                        │
 * │    export const contentTools: ToolModule = {                           │
 * │      specs: [{ name, title, description, inputSchema }],                │
 * │      handlers: { '<name>': async (args, ctx) => ({ ... }) },           │
 * │      scopes:  { '<name>': 'content:generate' },                        │
 * │    }                                                                     │
 * │  Puis remplacer le stub par : export { contentTools } from './content' │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export { coreTools } from './core'

// Phase 3 — modules câblés
export { contentTools } from './content'
export { accountTools } from './accounts'
export { revenueTools } from './revenue'
