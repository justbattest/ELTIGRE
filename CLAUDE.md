# EL TIGRE FACTORY — Guide Claude Code

## Architecture générale

```
emma-content-pipeline/
├── webapp/          # Next.js 14 app (port 3000)
├── pipeline/        # Scripts Python (scraping, génération, metadata)
├── venv/            # Python venv — toujours utiliser venv/bin/python
└── temp/            # Work dirs des runs (tmp, pas commités)
```

**DB** : PostgreSQL Supabase — `webapp/prisma/schema.prisma`  
**Auth** : NextAuth email+password (`webapp/lib/auth.ts`)  
**Credentials** : chiffrés AES-256 par userId dans `user_credentials`

---

## Démarrer le serveur

```bash
cd webapp && npm run dev   # port 3000
```

Log : `/tmp/nextjs.log`  
Kill + restart : `pkill -f "next dev" && npm run dev > /tmp/nextjs.log 2>&1 &`

---

## Système Vidéos — architecture clé

### DB : ValidatedPrompt
Table `validated_prompts` — prompts validés par niche, source : `WORKING_PROMPTS-3.md`

| Champ | Usage |
|---|---|
| `niche` | `conference_sport`, `golf`, `vieux` |
| `subNiche` | `conference`, `sport`, `golf`, `nurse`, `restaurant` |
| `promptJson` | JSON Seedance 2.0 exact (ne jamais modifier structurellement) |
| `outfitText` | Substring exact à remplacer pour variation outfit |
| `speakerLine` | Réplique féminine à remplacer pour variation phrase |
| `phraseVariations` | JSON array de phrases dédiées à ce concept précis |

### Ajouter une nouvelle niche
1. Analyser les prompts dans `WORKING_PROMPTS-3.md`
2. Ajouter les entrées dans `webapp/scripts/seed-validated-prompts.ts` (idempotent)
3. `npx tsx scripts/seed-validated-prompts.ts`
4. Ajouter pool outfits dans `pipeline/video_prompts.py` → `VARIATION_OUTFITS`
5. Ajouter pool outfits côté client dans `webapp/app/video/page.tsx`
6. Ajouter l'onglet dans le sélecteur de niche (4 onglets actuels : Conférence / Sport / Golf / Vieux)

### Modes de génération vidéo
- **direct** : prompt exact copie-conforme, zéro modification
- **variation** : swap outfit + phrase uniquement (règle : culotte rouge TOUJOURS fixe, jamais touchée)

### Règle ABSOLUTE variations
- `outfitText` = substring exact dans le JSON → `String.replace()` simple
- `speakerLine` = texte exact de la réplique → `String.replace()` simple
- Garde-fou Python : si "red" disparaît du prompt → rejeter silencieusement, retourner l'original
- Ne jamais toucher framing / motion_intensity / style / structure

---

## Phrases per-prompt (phraseVariations)
Chaque prompt validé a son propre pool de phrases calibrées sur SA scène précise.  
Principe : **100% défendable en contexte pro → effet complètement différent quand une femme ultra-attractive le dit dans CETTE scène**.  
Groupes actuels :
- `PHRASES_INAUGURATION` → P2
- `PHRASES_AUDITORIUM` → P3-V1/V2/V3
- `PHRASES_CONFERENCE_DISTRACTION` → P24/P25
- `PHRASES_KINE` → P18
- `PHRASES_COACH_PISTE` → P19/P20
- `PHRASES_COOLDOWN` → P21/P22/P23
- `PHRASES_VOLLEYBALL` → P26
- Phrases fauteuil roulant → P16/P17 (inline dans le seed)

---

## Scraping Instagram

**Flow** : instagrapi (cookie session) → instaloader (fallback) → Apify (si pas de cookie)  
**Cookie requis** pour éviter Apify (qui consomme des crédits).  
**Apify est OPTIONNEL** — ne pas l'exiger dans le check credentials (`api/run/route.ts`).

```python
# queue_manager.py — distribution par profil
per_profile_max = max(15, math.ceil(max_posts / n_profiles))
# Tri cross-profils par engagement après combinaison
all_post_data.sort(key=lambda item: likes + comments*3, reverse=True)
all_post_data = all_post_data[:max_posts]
```

**Events Python → Next.js** :
- `type: "warn"` pour erreurs par profil (profil vide, cookie expiré sur 1 profil)
- `type: "error"` uniquement pour erreurs fatales pipeline → exit(1)
- `type: "error"` NE DOIT PAS changer le status du run (`pipeline-events.ts`)

---

## Metadata Optimizer — FIXES CRITIQUES appliqués

### Fix DQT (qualité images)
**NE PAS** utiliser `_inject_apple_qtables()` — elle cause des artefacts.  
Utiliser `qtables={0: _APPLE_LUMA_NATURAL, 1: _APPLE_CHROMA_NATURAL}` dans PIL save.  
Tables converties zigzag→natural au chargement du module.

### Fix ICC (couleurs)
Toujours attacher sRGB IEC61966-2.1, ignorer le profil source.  
Higgsfield/Kling embarquent Display P3 dans leurs outputs → cast orange sans ce fix.

### Pipeline d'upload
Tous les contenus passent par `drive_uploader.upload_bytes()` avant Drive.  
`upload_bytes()` appelle `optimize_image_bytes()` ou `optimize_video_bytes()` automatiquement.

---

## Higgsfield / Seedance

**Token** : stocké chiffré dans DB, décrypté dans les routes API  
**Endpoint Reference Elements** : `GET https://fnf.higgsfield.ai/agents/custom-references`  
(découvert dans le binaire CLI — retourne soul_cinematic + soul_2 IDs)  
**Format prompt** : `<<<element_id>>> {prompt_json_string}`  
**Modèle vidéo** : Seedance 2.0, 9:16, 720p par défaut

---

## En cours (`/en-cours`)

Affiche 3 types de runs :
1. **DB-backed** (scraping, studio, vidéo) → SSE `/api/run/[id]/stream`
2. **Metadata** (in-memory `metadataRuns`) → SSE `/api/metadata/events/[runId]`
3. **Carousels** (in-memory `carouselRuns`) → SSE `/api/carousel/events/[runId]`

Navigation post-lancement : tous les outils redirigent vers `/en-cours` via `router.push('/en-cours')`.

---

## Patterns importants

### Hot-reload vs restart
- Changements TypeScript/TSX → hot-reload automatique
- Changements schema Prisma → `npx prisma db push` puis **restart serveur**
- Changements Python → pris en compte au prochain subprocess

### Seed script
```bash
cd webapp && npx tsx scripts/seed-validated-prompts.ts
```
Idempotent (upsert par title). Safe de re-lancer.

### Check TypeScript
```bash
cd webapp && npx tsc --noEmit 2>&1 | grep -v "seed-validated"
```

### Vérifier les logs d'un run
```bash
grep "\[run:RUN_ID" /tmp/nextjs.log | grep -v "prisma\|SELECT\|UPDATE"
```

---

## Ce qui NE marche pas / points d'attention

- `"ceiling fan"` dans les prompts → bug visuel IA, à bannir
- Pas de `quality=` dans PIL save pour les images → utiliser `qtables=` à la place
- Le status run ne doit JAMAIS être changé sur un event `type: error` intermédiaire
- `per_profile_max` minimum 15 (sinon les comptes très vidéo donnent trop peu d'images)
- Les Soul IDs (soul_cinematic) ≠ Reference Elements dans Higgsfield (UUIDs différents)
