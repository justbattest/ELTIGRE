/**
 * Modelify MCP — registre d'outils (types + agrégation).
 *
 * Le serveur MCP (`/mcp`) expose des "outils" à des agents externes. Pour garder
 * le code modulaire, chaque domaine fonctionnel (core, content, accounts,
 * revenue, ...) vit dans son propre fichier `handlers/<x>.ts` et exporte un
 * `ToolModule` : ses specs (publiées via `tools/list`), ses handlers (exécutés
 * via `tools/call`) et, par outil, le scope éventuellement requis.
 *
 * `tools.ts` combine tous les modules en un seul registre et expose
 * `listToolSpecs()` + `callTool()` au handler HTTP.
 *
 * AJOUTER UN OUTIL (Phase 3) — créer/éditer un fichier `handlers/<domaine>.ts` :
 *
 *   import type { ToolModule } from '../registry'
 *   export const contentTools: ToolModule = {
 *     specs: [{ name: 'modelify_xxx', title: '…', description: '…', inputSchema: { type: 'object', properties: {} } }],
 *     handlers: { modelify_xxx: async (args, ctx) => ({ ... }) },
 *     scopes:  { modelify_xxx: 'content:generate' }, // omettre = aucun scope (lecture seule)
 *   }
 *
 * puis le câbler dans `handlers/index.ts` (réexport) — `tools.ts` le ramasse
 * automatiquement.
 */

/** Spec d'un outil publiée via `tools/list` (JSON Schema brut, comme Blotato). */
export interface ToolSpec {
  name: string
  title: string
  description: string
  /** JSON Schema de l'objet d'arguments. */
  inputSchema: Record<string, unknown>
}

/** Contexte d'exécution résolu depuis la clé API du caller. */
export interface ToolContext {
  userId: string
  scopes: string[]
}

/** Implémentation d'un outil. Lève une Error → renvoyée comme `isError` au caller. */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>

/**
 * Contribution d'un fichier de handlers : ses specs, ses handlers (indexés par
 * nom d'outil) et la table des scopes requis (nom d'outil → scope). Un outil
 * absent de `scopes` (ou `undefined`) ne requiert aucun scope.
 */
export interface ToolModule {
  specs: ToolSpec[]
  handlers: Record<string, ToolHandler>
  scopes?: Record<string, string>
}

/** Registre agrégé prêt à l'emploi pour le dispatcher. */
export interface ToolRegistry {
  specs: ToolSpec[]
  handlers: Record<string, ToolHandler>
  /** nom d'outil → scope requis (`undefined` = aucun). */
  scopes: Record<string, string | undefined>
}

/**
 * Combine plusieurs `ToolModule` en un seul registre. En cas de collision de
 * nom d'outil, le dernier module gagne (les modules Phase 3 peuvent ainsi
 * surcharger un stub si besoin).
 */
export function combineModules(modules: ToolModule[]): ToolRegistry {
  const specsByName = new Map<string, ToolSpec>()
  const handlers: Record<string, ToolHandler> = {}
  const scopes: Record<string, string | undefined> = {}

  for (const mod of modules) {
    for (const spec of mod.specs) specsByName.set(spec.name, spec)
    for (const [name, handler] of Object.entries(mod.handlers)) handlers[name] = handler
    for (const [name, scope] of Object.entries(mod.scopes ?? {})) scopes[name] = scope
  }

  return { specs: [...specsByName.values()], handlers, scopes }
}
