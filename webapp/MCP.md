# Modelify MCP — piloter Modelify depuis Claude Code (ou tout client MCP)

## 1. C'est quoi

Modelify expose toute sa machinerie de production de contenu sous forme de **serveur MCP**. Concrètement : depuis **Claude Code**, **n8n**, ou n'importe quel client MCP, un agent peut piloter Modelify en langage naturel — créer des modèles IA, générer des sets de photos de référence, des images studio, des vidéos, des carrousels, optimiser les métadonnées, planifier des posts Instagram et suivre les revenus.

Techniquement, c'est un endpoint HTTP unique (`/mcp`) qui parle **JSON-RPC 2.0** (protocole MCP `2024-11-05`). Chaque requête s'authentifie avec une **clé API utilisateur** (`mk_live_...`). Le serveur est donc nativement **multi-tenant** : chaque appel est automatiquement cloisonné au propriétaire de la clé — un agent ne voit jamais les modèles, runs ou revenus d'un autre utilisateur.

Le catalogue compte **25 outils** répartis en 4 domaines :

| Domaine | Outils | Rôle |
|---|---|---|
| **Core** | 5 | Profil, listing des modèles/runs, lecture d'un run et de ses résultats |
| **Content** | 10 | Génération d'images, vidéos, carrousels, anti-détection, métadonnées |
| **Accounts & Instagram** | 7 | Modèles (« filles » IA), comptes Instagram, planification de posts, KPI |
| **Revenue** | 3 | Suivi et synthèse des revenus par modèle / par mois |

> Les noms d'outils restent en anglais (`modelify_generate_video`, etc.) — c'est ce que l'agent appelle. Le reste de cette doc est en français.

---

## 2. Le modèle de crédits

Chaque outil de **génération** débite des crédits du **wallet Modelify** de l'utilisateur. Les outils de **lecture** (profil, listings, statuts, résultats, KPI, revenus) sont **gratuits** (0 crédit).

Le barème est la source unique de vérité (`lib/mcp/pricing.ts`). Règle interne : `crédits = ceil(coût_USD × 20 / 0,10)`, soit ~20× le coût marginal réel. Valeur faciale : **1 crédit ≈ 0,10 $**.

| Outil | Crédits | Pourquoi |
|---|---:|---|
| `modelify_studio_batch` | **96** | ~12 images 2K |
| `modelify_generate_reference_set` | **80** | ~20 images i2i (Gemini / Nano Banana) |
| `modelify_enhance_set` | **80** | re-render i2i ~10 images 2K-4K |
| `modelify_motion_control` | **70** | clip motion control (~0,35 $) |
| `modelify_generate_video` | **60** | clip Seedance 2.0 (~0,30 $) |
| `modelify_bulk_edit` | **40** | édition i2i ~10 images |
| `modelify_create_carousel` | **32** | ~8 images i2i |
| `modelify_carousel_variations` | **24** | ~6 slides re-render |
| `modelify_spoof` | **1** | compute local (minimum symbolique) |
| `modelify_optimize_metadata` | **1** | LLM texte (minimum symbolique) |

Tous les autres outils (Core, listings, KPI, Revenue, `modelify_create_model`, `modelify_update_model`, `modelify_add_instagram_account`, `modelify_list_*`) sont **gratuits**.

**Solde insuffisant.** Le débit est atomique et sûr en concurrence (décrément conditionnel `balance >= montant`). Si le solde ne couvre pas le coût, l'outil renvoie une erreur **claire et lisible** (convention MCP `isError`), du type :

```
Crédits insuffisants : solde 12, requis 60
```

Aucun run n'est lancé et aucun crédit n'est débité dans ce cas.

> ⚠️ **Recharge de crédits — limitation v1.** Il n'existe **pas encore** de flux d'achat (aucune route Stripe / checkout dans le code à ce jour). Les crédits sont ajoutés via la fonction interne `credit()` (`lib/credits.ts`) — donc, pour l'instant, **manuellement par l'admin** (octroi direct en base). Un parcours d'achat self-service reste à construire.
>
> Note technique annexe : `modelify_schedule_instagram_post` a une entrée à 1 crédit dans le barème, **mais son handler ne débite pas réellement** (voir §9, smell connu) — la planification de post est donc gratuite en pratique aujourd'hui.

---

## 3. Prérequis

1. **Avoir un compte Modelify** (utilisateur NextAuth — email + mot de passe). C'est ce compte qui porte le wallet, les modèles, les runs et les clés API.

2. ⚠️ **La migration SQL doit avoir été appliquée par l'admin.** Les tables `api_keys`, `credit_wallets` et `credit_transactions` ne sont **jamais** créées automatiquement (pas de `prisma db push` sur la base de prod partagée). L'admin doit avoir appliqué **manuellement** :

   ```
   webapp/prisma/manual-migrations/0001_modelify_mcp_credits.sql
   ```

   au choix via **Supabase Studio → SQL Editor**, ou :

   ```bash
   psql "$DIRECT_URL" -f prisma/manual-migrations/0001_modelify_mcp_credits.sql
   ```

   La migration est **purement additive** (CREATE TABLE + index + FK, aucun ALTER/DROP, rejouable). **Sans elle, les clés API et les crédits ne fonctionnent pas** (les requêtes Prisma sur ces tables échouent).

3. **Avoir des crédits** sur son wallet pour utiliser les outils de génération (voir §2).

---

## 4. Générer une clé API

Les clés sont au format **`mk_live_` + 64 caractères hex**. Elles ne sont stockées en base **que sous forme de hash SHA-256** — le texte en clair n'est **affiché qu'une seule fois**, à la création. Si tu le perds, il faut en régénérer une.

### Scopes disponibles

| Scope | Donne accès à |
|---|---|
| `content:generate` | tous les outils de génération (Content) |
| `accounts:read` | lectures comptes/posts/KPI/revenus + `modelify_list_models` |
| `accounts:write` | création/màj modèles, ajout compte IG, planification post, enregistrement revenu |

Les outils Core de pure lecture (`modelify_get_user`, `modelify_list_runs`, `modelify_get_run`, `modelify_get_results`) **ne requièrent aucun scope**.

### Créer la clé (API)

La création passe par `POST /api/api-keys` **depuis une session connectée** (cookie NextAuth) — c'est une route protégée par session, pas par clé API. Exemple `curl` (récupère le cookie de session depuis ton navigateur connecté) :

```bash
curl -X POST https://www.modelify.ai/api/api-keys \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<TON_COOKIE_DE_SESSION>" \
  -d '{
    "label": "Claude Code - poste perso",
    "scopes": ["content:generate", "accounts:read", "accounts:write"]
  }'
```

Réponse (le champ `key` n'apparaît **qu'ici**) :

```json
{
  "id": "ckxyz...",
  "key": "mk_live_3f8a...<64 hex>",
  "prefix": "mk_live_",
  "label": "Claude Code - poste perso",
  "scopes": ["content:generate", "accounts:read", "accounts:write"]
}
```

Notes :
- Si tu omets `scopes` (ou envoies un corps vide), la clé reçoit **les trois scopes par défaut**.
- `label` est optionnel (max 100 caractères).
- En local : remplace l'URL par `http://localhost:3000/api/api-keys`.

> **Futur bouton Réglages → Clés API.** À terme, cette création se fera depuis l'UI Modelify (Réglages → Clés API : bouton « Générer », choix des scopes, copie unique du `mk_live_...`, liste des clés existantes, révocation). En attendant, le `curl` ci-dessus est la voie officielle.

### Lister / révoquer

- `GET /api/api-keys` (session) → liste tes clés (préfixe, label, scopes, `lastUsedAt`) — jamais le clair ni le hash.
- `DELETE /api/api-keys?id=<keyId>` (session) → révoque une clé (scopée à toi : tu ne peux supprimer que les tiennes).

---

## 5. Brancher à Claude Code

Une fois la clé en main, ajoute le serveur en transport HTTP avec le header d'auth :

```bash
# Local (dev, port 3000)
claude mcp add --transport http modelify http://localhost:3000/mcp \
  --header "modelify-api-key: mk_live_xxx"

# Production
claude mcp add --transport http modelify https://www.modelify.ai/mcp \
  --header "modelify-api-key: mk_live_xxx"
```

Trois en-têtes d'auth sont acceptés, par ordre de priorité :

1. `modelify-api-key: mk_live_...`
2. `x-api-key: mk_live_...`
3. `Authorization: Bearer mk_live_...`

### Bloc de config équivalent (JSON)

Dans `~/.claude.json` (ou la config MCP de ton client) :

```json
{
  "mcpServers": {
    "modelify": {
      "type": "http",
      "url": "https://www.modelify.ai/mcp",
      "headers": {
        "modelify-api-key": "mk_live_xxx"
      }
    }
  }
}
```

> **Vérifie d'abord la clé.** Demande à l'agent d'appeler `modelify_get_user` : il te renvoie `userId`, `creditBalance` et `scopes`. Si la clé est invalide/absente, tout outil (sauf le handshake `initialize`) répond `Clé API invalide ou manquante`. Note : même `tools/list` exige une clé valide.

---

## 6. Le catalogue d'outils

Conventions : **coût en crédits** (0 = gratuit), **scope** requis. Les entrées média (`...Url`, `...Base64`, `imageUrls[]`, `fileUrls[]`) acceptent une **URL http(s)**, un **data: URI** ou du **base64 brut** — le serveur les matérialise en fichiers temp avant de lancer le pipeline.

### Core (lecture, gratuit)

| Outil | Ce que ça fait | Inputs clés | Scope | Coût |
|---|---|---|---|---:|
| `modelify_get_user` | Profil de la clé : `userId`, solde de crédits, scopes. À appeler en premier. | — | aucun | 0 |
| `modelify_list_models` | Liste les modèles (« filles » IA) : id, nom, statut, étape, handles IG/Fanvue. | — | `accounts:read` | 0 |
| `modelify_list_runs` | Runs de génération récents (id, statut, compteurs de posts, date). | `status?`, `limit?` (déf 20, max 100) | aucun | 0 |
| `modelify_get_run` | Statut + progression d'un run (`totalPosts`/`completedPosts`/`failedPosts`). | `runId` | aucun | 0 |
| `modelify_get_results` | Résultats finis d'un run (URL image générée + URL Drive). **Voir §7 (caveat).** | `runId` | aucun | 0 |

### Content (génération — scope `content:generate`)

| Outil | Ce que ça fait | Inputs clés | Coût |
|---|---|---|---:|
| `modelify_generate_reference_set` | Set d'images de référence cohérentes (i2i Gemini/Nano Banana) depuis une **ancre d'identité** + prompts. Requiert `GEMINI_API_KEY` serveur. | `anchorUrl` **ou** `anchorBase64`, `prompts[]` (string ou `{id,label,prompt}`), `resolution?` (0.5K/1K/2K/4K, déf 2K), `aspectRatio?` (déf 9:16) | 80 |
| `modelify_enhance_set` | Édite des images d'un set existant (Seedream 4.5 : morph morpho / vue de dos). | `items[]` = `[{runId,name}]`, `mode?` (morph/back/both), `route?` (wavespeed/modelark), `bustIdx?` 0-3, `buttIdx?` 0-2, `hips?` (wide/moderate/subtle), `seed?`, `keepFraming?`, `keepDress?` | 80 |
| `modelify_studio_batch` | Lot d'images stylisées via Prompt Studio (Higgsfield SoulCinema + Claude). Requiert Anthropic + Higgsfield. | `soulId`, `elementId`, `mode?` (batch_config/random_select/random_full), `count?` (déf 10), `selections?`, `model?`, `aspectRatio?` (déf 2:3), `quality?` (déf 2k), `characterName?` | 96 |
| `modelify_bulk_edit` | Applique un même prompt i2i (Seedream 4.5) à un lot d'images. Requiert Higgsfield. | `prompt`, **source** = `uploadRunId` **ou** `imageUrls[]`, `elementId?`, `quality?` (low/medium/high, déf high), `characterName?` | 40 |
| `modelify_generate_video` | Lot de vidéos (Seedance 2.0, 9:16). Modes prompts validés (`direct`/`variation`) ou legacy (banque par niche). Requiert Higgsfield. | `elementId`, `mode?`, `validatedPromptIds[]` (direct/variation), `batchCount?`, `outfitOverride?`, `phraseOverride?`, `niche?`, `count?`, `aspectRatio?` (déf 9:16), `resolution?` (déf 720p), `duration?` (déf 5s), `characterName?` | 60 |
| `modelify_create_carousel` | Assemble des carrousels IG depuis un pool d'images (≥ 4). Requiert Google Drive. | `imageUrls[]` (ou `images[]`, ≥ 4), `maxCarousels?` (1-200, déf 200), `characterName?` | 32 |
| `modelify_carousel_variations` | Pour chaque image : 3 variations i2i (SoulCinema) + dossier carrousel Drive. Requiert Higgsfield + Anthropic + Drive. | `imageUrls[]`, `soulId`, `quality?` (déf 2k), `characterName?` | 24 |
| `modelify_motion_control` | Applique le mouvement d'une vidéo de réf à une image concept (Kling 3.0 + Seedream outfits). Requiert Higgsfield. | **Mode A** : `conceptImageUrl` + `conceptVideoUrl` ; **Mode B** : `conceptId` (bibliothèque) ; `characterName?` | 70 |
| `modelify_spoof` | Variations anti-détection (rotation/crop/bruit/EXIF/mirror). 100% local, aucun credential. | `fileUrls[]`, `level?` (light/medium/aggressive, déf medium), `variations?` (1-20, déf 5), `noMirror?` | 1 |
| `modelify_optimize_metadata` | Optimise les métadonnées (EXIF/ICC/qtables façon iPhone naturel) + pousse sur Drive. Requiert Drive. | `fileUrls[]`, `characterName?` | 1 |

### Accounts & Instagram

| Outil | Ce que ça fait | Inputs clés | Scope | Coût |
|---|---|---|---|---:|
| `modelify_create_model` | Crée un modèle (« fille » IA). Démarre au statut `creating`, étape 1. | `name`, + opt `gmailAddress`, `instagramHandle`, `fanvueHandle`, `phoneLabel`, `phoneNumber`, `higgsfieldCharacterName`, `avatarUrl`, `notes` | `accounts:write` | 0 |
| `modelify_update_model` | Met à jour un modèle (champs fournis uniquement). | `modelId`, + `name?`, `status?`, `currentStep?` (1-6), `stepState?`, champs identité/Higgsfield | `accounts:write` | 0 |
| `modelify_list_instagram_accounts` | Liste les comptes IG (username, réseau, warmupPhase, statut, postsToday…). Jamais de credentials. | — | `accounts:read` | 0 |
| `modelify_add_instagram_account` | Ajoute un compte IG. Password/TOTP chiffrés AES-256, jamais renvoyés. Refuse les doublons. | `username`, `networkName`, + `password?`, `totpSecret?` (base32), `characterName?`, `warmupPhase?` (déf 1) | `accounts:write` | 0 |
| `modelify_schedule_instagram_post` | Planifie un post IG (statut `pending`). Anti-bot : décale ±7-23 min si l'heure tombe pile à H:00/H:30. Refuse comptes banned/challenge. | `accountId` + une source média (`driveFileUrl`/`driveFileId`/`mediaUrl`/`driveFilesJson`), `caption?`, `mediaType?` (reel/photo, déf reel), `scheduledFor?` (ISO 8601) | `accounts:write` | 0 ⚠️ |
| `modelify_list_instagram_posts` | Liste les posts planifiés, triés par `scheduledFor`. | `status?`, `accountId?`, `limit?` (déf 20, max 100) | `accounts:read` | 0 |
| `modelify_kpi` | Dashboard : comptes par statut, posts par statut, squelette revenus. | — | `accounts:read` | 0 |

⚠️ Le barème déclare 1 crédit pour `modelify_schedule_instagram_post` mais le handler ne débite pas — gratuit en pratique (voir §9).

### Revenue

| Outil | Ce que ça fait | Inputs clés | Scope | Coût |
|---|---|---|---|---:|
| `modelify_list_revenue` | Liste les lignes de revenu (montant, devise, source, mois, note). | `modelId?`, `periodMonth?` (YYYY-MM), `limit?` (déf 50, max 200) | `accounts:read` | 0 |
| `modelify_record_revenue` | Enregistre un revenu pour un modèle. Propriété vérifiée. | `modelId`, `amount` (> 0), `periodMonth` (YYYY-MM), + `currency?` (déf EUR), `source?` (fanvue/tips/other, déf fanvue), `note?` | `accounts:write` | 0 |
| `modelify_revenue_summary` | Agrège : total par modèle, total par mois, grand total. | — | `accounts:read` | 0 |

---

## 7. Le pattern asynchrone (génération)

Tous les outils de génération sont **asynchrones**. Ils débitent les crédits, lancent un subprocess pipeline, et retournent **immédiatement** :

```json
{ "runId": "ck...", "status": "running", "creditsCharged": 60, "balance": 940 }
```

Le cycle de suivi est donc :

1. **submit** → un outil de génération renvoie `{ runId }`.
2. **poll** → `modelify_get_run({ runId })` jusqu'à `status: "completed"` (ou `failed`). Tu y lis `totalPosts` / `completedPosts` / `failedPosts`.
3. **results** → `modelify_get_results({ runId })` renvoie, pour chaque génération aboutie, `generatedImageUrl` + `driveGeneratedUrl`.

### ⚠️ Caveat important : `get_results` est vide pour 6 pipelines

`modelify_get_results` lit la table `Generation`. Or **6 pipelines n'écrivent PAS dans cette table** — ils poussent leurs sorties ailleurs. Pour ceux-là, `get_results` renvoie `count: 0` même quand le run a réussi. Il faut récupérer les fichiers **à la source** :

| Pipeline | Outil | Où récupérer les résultats |
|---|---|---|
| Set de référence | `modelify_generate_reference_set` | **Supabase Storage** (préfixe `<userId>/refset/<runId>`) + noms via le flux d'events du run |
| Enhance set | `modelify_enhance_set` | **Supabase Storage** (préfixe `<userId>/edits/<runId>`) |
| Carrousels | `modelify_create_carousel` | **Google Drive** (poussé directement, état in-memory) |
| Variations carrousel | `modelify_carousel_variations` | **Google Drive** |
| Métadonnées | `modelify_optimize_metadata` | **Google Drive** |
| Spoof | `modelify_spoof` | **ZIP** servi par l'app (état in-memory) |

Pour ces runs : suis le **statut** via `modelify_get_run`, puis va chercher les fichiers dans le **Storage / Drive / ZIP** correspondant. Les pipelines qui écrivent bien dans `Generation` (et donc visibles via `get_results`) sont notamment `modelify_studio_batch`, `modelify_bulk_edit`, `modelify_generate_video`, `modelify_motion_control`.

> Note de fragilité (v1) : `modelify_enhance_set` dépend de l'**état in-memory** du set source (le `runId` de référence doit être encore présent : ~2h, perdu au redémarrage du serveur). Les `name` de fichiers proviennent des events du run de référence.

---

## 8. Exemple de bout en bout

Scénario depuis Claude Code : créer une modèle, générer son set de référence, lancer une vidéo, vérifier le statut, planifier un post IG. (Pseudo-appels d'outils.)

```text
# 0. Vérifier la clé et le solde
modelify_get_user()
→ { userId, creditBalance: 1000, scopes: [...] }

# 1. Créer la modèle
modelify_create_model({ name: "Luna", instagramHandle: "@luna.ai" })
→ { model: { id: "mdl_123", status: "creating", currentStep: 1 } }

# 2. Générer son set de référence (80 crédits) depuis une ancre d'identité
modelify_generate_reference_set({
  anchorUrl: "https://.../luna_anchor.jpg",
  prompts: ["café terrasse iPhone", "chambre lumière du jour", "selfie miroir"],
  resolution: "2K", aspectRatio: "9:16"
})
→ { runId: "run_ref1", status: "running", creditsCharged: 80, balance: 920 }

# 3. Poll jusqu'à completion
modelify_get_run({ runId: "run_ref1" })
→ { status: "completed", totalPosts: 3, completedPosts: 3 }
# (Set de référence → résultats dans Supabase Storage, pas dans get_results)

# 4. Lancer une vidéo (60 crédits) — elementId Higgsfield requis
modelify_generate_video({
  elementId: "elem_abc", mode: "direct",
  validatedPromptIds: [12, 18], resolution: "720p", duration: 5
})
→ { runId: "run_vid1", status: "running", creditsCharged: 60, balance: 860 }

# 5. Vérifier le statut + récupérer les URLs (video écrit dans Generation)
modelify_get_run({ runId: "run_vid1" })      → { status: "completed", ... }
modelify_get_results({ runId: "run_vid1" })  → { results: [{ generatedImageUrl, driveGeneratedUrl }] }

# 6. Ajouter le compte IG puis planifier un post
modelify_add_instagram_account({ username: "luna.ai", networkName: "iPhone_SIM1" })
→ { account: { id: "acc_777", status: "warmup" } }

modelify_schedule_instagram_post({
  accountId: "acc_777",
  driveFileUrl: "https://drive.google.com/.../reel.mp4",
  caption: "golden hour 🌅", mediaType: "reel",
  scheduledFor: "2026-06-28T18:00:00Z"   # 18:00 pile → décalé ±7-23 min (anti-bot)
})
→ { post: { id: "post_999", status: "pending", scheduledFor: "2026-06-28T18:14:00Z" } }
```

---

## 9. Sécurité & limites

- **La clé = un secret.** Elle donne accès à TON compte (génération facturée, modèles, comptes IG, revenus). Ne la commit jamais, ne la partage pas. Stockée en base uniquement en hash SHA-256 ; le clair n'est montré qu'une fois.
- **Révocation.** `DELETE /api/api-keys?id=<keyId>` (session connectée). Une clé révoquée cesse immédiatement de fonctionner. Les clés peuvent aussi avoir une expiration (`expiresAt`) — une clé expirée est refusée.
- **Scopes.** Chaque outil sensible vérifie son scope ; à défaut tu obtiens `Scope requis: <scope>`. Donne le minimum nécessaire à chaque clé (ex. une clé read-only avec seulement `accounts:read`).
- **CORS ouvert, mais auth par header.** Le endpoint répond `Access-Control-Allow-Origin: *` — c'est volontaire (clients variés). La sécurité ne repose **pas** sur le CORS mais sur la **clé API en header** : sans clé valide, aucun outil n'est exécuté. Comme l'auth est par header (et non par cookie), l'ouverture CORS n'expose pas de CSRF.
- **Cloisonnement multi-tenant.** Chaque run/modèle/compte/revenu est filtré par `userId`. Tenter de lire le run d'un autre renvoie `Run non autorisé` (équivalent 403).
- **Les erreurs d'outil sont des résultats, pas des erreurs de protocole.** Un solde insuffisant, un credential manquant ou une entrée invalide reviennent en `isError: true` avec un message lisible — l'agent peut réagir au lieu de planter.

### Limites v1 connues (à plat)

- **Pas de recharge self-service** : aucune route Stripe/checkout. Crédits ajoutés manuellement par l'admin (§2).
- **`get_results` partiel** : 6 pipelines écrivent hors table `Generation` (Storage/Drive/ZIP) → `get_results` vide pour eux (§7).
- **Bypass de la file de ressources** : les runs lancés via MCP appellent directement `spawnPipelineRun` (subprocess) — ils **ne passent pas** par la file de ressources / l'ordonnancement de l'app web. Plusieurs gros runs MCP simultanés peuvent donc se télescoper sur les ressources serveur. À surveiller en prod.
- **État in-memory fragile** : `enhance_set` (set source), carrousels, spoof, métadonnées s'appuient sur un état mémoire perdu au redémarrage du serveur et expirant (~2h pour les refsets).

---

## Annexe — endpoint & méthodes

- **Endpoint** : `POST /mcp` (JSON-RPC 2.0). `GET /mcp` renvoie un descripteur. `OPTIONS` pour le pre-flight CORS.
- **Protocole** : `2024-11-05`. `initialize` et les `notifications/*` ne demandent **pas** de clé ; tout le reste (`tools/list`, `tools/call`) **exige** une clé valide.
- **URL prod** : `https://www.modelify.ai/mcp` — **URL local** : `http://localhost:3000/mcp`.
```
