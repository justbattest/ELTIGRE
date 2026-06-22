"""
Prompt Studio — génération de prompts manuelle sans scraping Instagram.

Flow :
1. Charge le skill i2i complet (5 fichiers)
2. Appelle Claude Haiku pour générer N prompts distincts à partir des sélections
3. Lance chaque prompt sur Higgsfield via generate_with_fallback()
4. Émet des événements JSON sur stdout (même protocole que pipeline.main)

Modes :
- batch_config   : 10 prompts variés depuis les sélections de l'utilisateur
- random_select  : 50 prompts en piochant aléatoirement DANS les sélections
- random_full    : 50 prompts 100% aléatoires depuis le vocabulary-banks complet
"""

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

import anthropic


# ─── Chargement du skill complet ─────────────────────────────────────────────

def load_full_skill() -> str:
    """Charge les 5 fichiers du skill (version complète — pas pruned comme l'analyzer).

    Tokens estimés :
    - SKILL.md                  : ~4 200
    - identity-preservation.md : ~2 400
    - vocabulary-banks.md       : ~6 300
    - style-templates.md        : ~4 600
    - example-scenes.md         : ~9 500
    Total                       : ~27 000 tokens (mis en cache → coût 10% après 1er appel)
    """
    base = Path("./skills/i2i-avatar-creator-base")

    if not (base / "SKILL.md").exists():
        raise FileNotFoundError(
            f"Skill i2i-avatar-creator-base introuvable dans {base.absolute()}."
        )

    refs = base / "references"
    parts = [
        (base / "SKILL.md").read_text(),
        "\n\n---\n## identity-preservation.md\n",
        (refs / "identity-preservation.md").read_text(),
        "\n\n---\n## vocabulary-banks.md\n",
        (refs / "vocabulary-banks.md").read_text(),
        "\n\n---\n## style-templates.md\n",
        (refs / "style-templates.md").read_text(),
        "\n\n---\n## example-scenes.md\n",
        (refs / "example-scenes.md").read_text(),
        """

---
## CONTEXTE PROMPT STUDIO

Tu génères des prompts Nano Banana image-to-image pour un système de batch automatique.
L'utilisateur a sélectionné des paramètres via une interface graphique.
Tu dois générer exactement le nombre de prompts demandé, distincts et variés.

RÈGLES ABSOLUES pour tous les prompts générés :
- NE JAMAIS décrire les caractéristiques physiques : couleur de cheveux, couleur des yeux, teinte de peau, morphologie, taille, corpulence, forme du visage.
- Référencer le personnage uniquement comme "the woman" ou "the character" sans adjectifs physiques.
- INTERDICTION ABSOLUE des tatouages : ne jamais mentionner ni inclure de tatouages.
- NE PAS inclure <<<UUID>>> dans le prompt (le pipeline l'injecte automatiquement selon le modèle).
- Chaque prompt doit être COMPLET avec toutes les sections du template Style A.

Répondre en JSON strict UNIQUEMENT :
{"prompts": ["prompt 1 complet...", "prompt 2 complet...", ...]}
"""
    ]
    return "".join(parts)


# ─── Génération des prompts avec Claude ──────────────────────────────────────

def _build_user_message(selections: dict, mode: str, count: int) -> str:
    """Construit le message utilisateur envoyé à Claude."""

    def fmt_list(lst: list) -> str:
        return ", ".join(lst) if lst else "(aucune sélection)"

    sel_block = f"""Sélections de l'utilisateur :
  Lieu(x)    : {fmt_list(selections.get('lieu', []))}
  Activité(s): {fmt_list(selections.get('activite', []))}
  Outfit(s)  : {fmt_list(selections.get('outfit', []))}
  Bijoux     : {fmt_list(selections.get('bijoux', []))}
  Background : {fmt_list(selections.get('background', []))}
  Shot type  : {fmt_list(selections.get('shotType', []))}
  Color grade: {fmt_list(selections.get('colorGrade', []))}
  Features   : {fmt_list(selections.get('features', []))}"""

    if mode == "batch_config":
        instruction = f"""Mode : BATCH CONFIG
Génère exactement {count} prompts Nano Banana Style A DISTINCTS.
Utilise les sélections comme contraintes de base.
Varie pour chaque prompt : l'heure précise, le fond détaillé, la pose exacte, les imperfections, les détails couleur, les objets en main.
Chaque prompt doit décrire une scène différente même si les catégories de base sont similaires."""

    elif mode == "random_select":
        instruction = f"""Mode : RANDOM SÉLECTION
Génère exactement {count} prompts Nano Banana Style A DISTINCTS.
Pioche ALÉATOIREMENT dans les sélections fournies.
Chaque prompt peut utiliser une combinaison différente des options sélectionnées.
Maximise la variété : ne répète pas la même combinaison deux fois."""

    else:  # random_full
        instruction = f"""Mode : RANDOM FULL
Génère exactement {count} prompts Nano Banana Style A DISTINCTS.
IGNORE complètement les sélections.
Pioche librement dans le vocabulary-banks complet : tous les lieux, activités, outfits, backgrounds, poses, horaires, couleurs disponibles.
Maximise la diversité — 50 scènes de vie totalement différentes."""

    return f"""{instruction}

{sel_block if mode != 'random_full' else ""}

Chaque prompt doit être complet (toutes les sections du template Style A).
Aucun prompt ne doit répéter une scène identique à un autre.

Réponds en JSON strict — aucun texte autour :
{{"prompts": ["prompt complet 1...", "prompt complet 2...", ...]}}"""


_PROMPT_BATCH_SIZE = 10  # Max prompts par appel Claude (budget ~7000 tokens)


def _call_claude_for_prompts(
    selections: dict,
    mode: str,
    count: int,
    client,
    system_text: str,
) -> list[str]:
    """Un seul appel Claude pour `count` prompts (≤ _PROMPT_BATCH_SIZE)."""
    max_tokens = count * 750  # ~750 tokens/prompt avec marge

    resp = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=max_tokens,
        system=[
            {
                "type": "text",
                "text": system_text,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{
            "role": "user",
            "content": _build_user_message(selections, mode, count)
        }]
    )

    raw = resp.content[0].text.strip()

    # Nettoyer les blocs markdown éventuels
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    # Parser JSON avec fallbacks progressifs
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback 1 : remplacer les chars de contrôle DANS les strings JSON
        cleaned = re.sub(
            r'(?s)"(?:[^"\\]|\\.)*"',
            lambda m: (m.group()
                       .replace('\n', '\\n')
                       .replace('\r', '\\r')
                       .replace('\t', '\\t')),
            raw
        )
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            # Fallback 2 : supprimer tous les chars de contrôle restants
            cleaned2 = re.sub(r'[\x00-\x1f\x7f]', ' ', cleaned)
            data = json.loads(cleaned2)

    return data.get("prompts", [])


def generate_prompts_with_claude(
    selections: dict,
    mode: str,
    count: int,
    anthropic_key: str,
) -> list[str]:
    """Appelle Claude Haiku (en batches si count > _PROMPT_BATCH_SIZE) et retourne `count` prompts."""
    client = anthropic.Anthropic(api_key=anthropic_key)
    system_text = load_full_skill()

    # ─── Inject character-specific physical rules from env ───────────────
    character_rules_json = os.environ.get("CHARACTER_PROMPT_RULES", "").strip()
    selected_char_name = os.environ.get("SELECTED_CHARACTER_NAME", "").strip()

    if character_rules_json and selected_char_name:
        try:
            rules_map = json.loads(character_rules_json)
            # Find matching rules (case-insensitive partial match)
            char_rules = None
            for name, rules in rules_map.items():
                if name.lower() in selected_char_name.lower() or selected_char_name.lower() in name.lower():
                    char_rules = rules
                    break

            if char_rules:
                system_text += f"""

CHARACTER-SPECIFIC PHYSICAL RULES (MANDATORY — override the "never describe physical features" rule for this character):
{char_rules}

These traits MUST be visible in EVERY prompt you generate:
- Outfits MUST show/reveal these features (never hide them with long sleeves, coats, oversized clothing)
- Reference these traits in the outfit description AND the pose/framing description
- These rules take ABSOLUTE PRIORITY over the general "do not describe physical features" instruction
"""
        except json.JSONDecodeError:
            pass

    # ─── Inject diversity rules ─────────────────────────────────────────
    system_text += """

DIVERSITY RULES (MANDATORY for every batch):
- Maximum 1 selfie per 5 prompts. Shot type distribution: candid (30%), mirror (15%), friend-POV (20%), vlog-POV (10%), selfie (15%), editorial (10%)
- NEVER repeat the same location across prompts in a batch — each MUST have a UNIQUE specific location with city name and neighborhood
- NEVER reuse the same activity across prompts — each MUST be a different mid-action
- NEVER generate generic "sitting at café table" or "walking through market" or "standing at beach" — these are AI clichés that always look fake
- Color grades MUST be physically described with 3 parts (highlights/shadows/midtones), NEVER use mood words like "warm" or "cozy" alone
- Beach and outdoor scenes: use MUTED natural tones, NEVER oversaturated yellows or oranges. Always specify "desaturated warm highlights, cool blue shadows, neutral midtones, no Instagram filter, no saturation boost"
- Each prompt MUST have a different time of day from the others in the batch
- Vary distances: mix close-up, waist-up, full-body, and 3/4 shots across the batch

AI CLICHÉ BLACKLIST — NEVER generate these overused scenes:
- Generic outdoor market stalls (always looks AI-generated)
- Generic café terrace without specific named café + detailed 10-object inventory
- Generic beach sunset with saturated warm colors
- "Holding coffee cup" as the only action
- Clean pristine environments (always add realistic mess: crumpled napkin, water ring on table, loose hair tie)
- Perfect symmetrical poses (always offset: weight on one leg, head tilted, one hand busy)
"""

    all_prompts: list[str] = []
    remaining = count

    while remaining > 0:
        batch = min(remaining, _PROMPT_BATCH_SIZE)
        prompts = _call_claude_for_prompts(selections, mode, batch, client, system_text)
        if not prompts:
            raise ValueError(f"Claude n'a retourné aucun prompt (batch de {batch})")
        all_prompts.extend(prompts)
        remaining -= batch

    if not all_prompts:
        raise ValueError("Claude n'a retourné aucun prompt")

    return all_prompts[:count]


# ─── Run studio ──────────────────────────────────────────────────────────────

async def run_studio(
    run_id: str,
    selections: dict,
    mode: str,
    count: int,
    soul_id: str,
    element_id: str,
    model_setting: str,
    aspect_ratio: str,
    quality: str,
    anthropic_key: str,
    higgsfield_token: str,
) -> None:
    """Orchestre la génération complète du Prompt Studio."""
    from pipeline.generator import generate_with_fallback
    from pipeline.drive_uploader import init_drive_uploader_from_env, get_uploader

    # Initialiser Drive si configuré
    uploader_init = init_drive_uploader_from_env()
    if uploader_init:
        print(json.dumps({"type": "info", "msg": "Google Drive configuré ✓"}), flush=True)

    # Phase 1 : génération des prompts par Claude
    print(json.dumps({
        "type": "phase",
        "phase": "generating_prompts",
        "pct": 0,
        "msg": f"Génération de {count} prompts avec Claude…"
    }), flush=True)

    try:
        prompts = generate_prompts_with_claude(selections, mode, count, anthropic_key)
    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": f"Claude prompt generation failed: {e}"
        }), flush=True)
        sys.exit(1)

    actual_count = len(prompts)
    print(json.dumps({
        "type": "phase",
        "phase": "generating_prompts",
        "pct": 100,
        "msg": f"{actual_count} prompts générés ✓"
    }), flush=True)

    # Émettre le total pour que Next.js initialise le compteur
    print(json.dumps({
        "type": "generation_start",
        "total": actual_count,
    }), flush=True)

    # Phase 2 : lancement Higgsfield en parallèle
    completed = 0
    failed = 0
    fallbacks = 0

    async def generate_one(i: int, prompt: str):
        nonlocal completed, failed, fallbacks

        shortcode = f"studio_{i}"

        print(json.dumps({
            "type": "generation",
            "shortcode": shortcode,
            "status": "started",
            "rank": i,
        }), flush=True)

        result = await generate_with_fallback(
            prompt=prompt,
            soul_id=soul_id,
            element_id=element_id,
            user_token=higgsfield_token,
            aspect_ratio=aspect_ratio,
            quality=quality,
            model_setting=model_setting,
            shortcode=shortcode,
        )

        if result.get("url"):
            completed += 1
            if result.get("fallback"):
                fallbacks += 1

            # Upload Drive si configuré
            drive_generated_url = None
            uploader = get_uploader()
            if uploader:
                try:
                    drive_result = await uploader.upload_generation(
                        run_id=run_id,
                        shortcode=shortcode,
                        local_image_path=None,       # pas de source locale pour le studio
                        generated_image_url=result["url"],
                        rank=i,
                    )
                    drive_generated_url = drive_result.get("drive_generated_url")
                except Exception as de:
                    print(json.dumps({"type": "warn", "msg": f"Drive upload error: {de}"}), flush=True)

            print(json.dumps({
                "type": "generation",
                "shortcode": shortcode,
                "status": "complete",
                "url": result["url"],
                "model": result["model"],
                "fallback": result.get("fallback", False),
                "prompt": prompt,
                "slide_index": 0,
                "local_image_path": None,
                "drive_generated_url": drive_generated_url,
                "scene": f"Studio #{i + 1}",
                "likes": 0,
                "comments": 0,
                "caption": "",
                "post_url": "",
                "rank": i,
            }), flush=True)
        else:
            failed += 1
            print(json.dumps({
                "type": "generation",
                "shortcode": shortcode,
                "status": "failed",
                "error": result.get("error", "UNKNOWN"),
                "rank": i,
            }), flush=True)

    tasks = [generate_one(i, prompt) for i, prompt in enumerate(prompts)]
    await asyncio.gather(*tasks)

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": actual_count,
        "completed": completed,
        "failed": failed,
        "fallbacks": fallbacks,
    }), flush=True)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Prompt Studio — génération batch sans scraping")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--selections", required=True, help="JSON des sélections")
    parser.add_argument("--mode", required=True, choices=["batch_config", "random_select", "random_full"])
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--soul-id", required=True)
    parser.add_argument("--element-id", required=True)
    parser.add_argument("--model", default="auto")
    parser.add_argument("--aspect-ratio", default="2:3")
    parser.add_argument("--quality", default="2k")
    args = parser.parse_args()

    anthropic_key = os.environ.get("ANTHROPIC_KEY")
    higgsfield_token = os.environ.get("HIGGSFIELD_TOKEN")

    if not anthropic_key:
        print(json.dumps({"type": "error", "message": "ANTHROPIC_KEY manquant"}), flush=True)
        sys.exit(1)
    if not higgsfield_token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    try:
        selections = json.loads(args.selections)
    except json.JSONDecodeError as e:
        print(json.dumps({"type": "error", "message": f"Selections JSON invalide: {e}"}), flush=True)
        sys.exit(1)

    asyncio.run(run_studio(
        run_id=args.run_id,
        selections=selections,
        mode=args.mode,
        count=args.count,
        soul_id=args.soul_id,
        element_id=args.element_id,
        model_setting=args.model,
        aspect_ratio=args.aspect_ratio,
        quality=args.quality,
        anthropic_key=anthropic_key,
        higgsfield_token=higgsfield_token,
    ))


if __name__ == "__main__":
    main()
