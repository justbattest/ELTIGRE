/**
 * Modelify MCP — registre d'outils + dispatcher.
 *
 * Combine tous les `ToolModule` (core + Phase 3) en un seul registre et expose
 * deux helpers au handler HTTP `/mcp` :
 *   - `listToolSpecs()` → les specs publiées via `tools/list`
 *   - `callTool(name, args, ctx)` → exécute un outil avec enforcement du scope
 *
 * Convention de contribution + types : voir `registry.ts`. Câblage des modules :
 * voir `handlers/index.ts`.
 */

import { combineModules, type ToolContext, type ToolSpec } from './registry'
import { coreTools, contentTools, accountTools, revenueTools } from './handlers'

const registry = combineModules([coreTools, contentTools, accountTools, revenueTools])

/** Specs publiées par le serveur (tools/list). */
export function listToolSpecs(): ToolSpec[] {
  return registry.specs
}

/** Résultat normalisé d'un appel d'outil, consommé par le handler HTTP. */
export interface ToolResult {
  /** Charge utile texte (JSON sérialisé en cas de succès, message en cas d'erreur). */
  text: string
  /** true ⇒ le client doit traiter `text` comme une erreur (convention MCP). */
  isError?: boolean
}

/**
 * Exécute un outil :
 *   1. résout le handler (outil inconnu ⇒ isError),
 *   2. enforce le scope requis (manquant ⇒ isError "Scope requis: X"),
 *   3. lance le handler et sérialise la sortie,
 *   4. toute Error levée ⇒ isError avec son message (jamais une exception).
 *
 * Ne jette jamais : renvoie toujours un `ToolResult` (les erreurs d'outil sont
 * des résultats, pas des erreurs de protocole — l'agent peut les lire/réagir).
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const handler = registry.handlers[name]
  if (!handler) {
    return { isError: true, text: `Outil inconnu: ${name}` }
  }

  const requiredScope = registry.scopes[name]
  if (requiredScope && !ctx.scopes.includes(requiredScope)) {
    return { isError: true, text: `Scope requis: ${requiredScope}` }
  }

  try {
    const out = await handler(args ?? {}, ctx)
    return { text: JSON.stringify(out) }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur outil'
    return { isError: true, text: message }
  }
}
