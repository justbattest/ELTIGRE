"""
Analyse Claude API + skill i2i-avatar-creator-base.
Génère un prompt Higgsfield pour la meilleure slide d'un carousel.
"""

import json
import base64
from pathlib import Path
import anthropic


def load_i2i_skill() -> str:
    """Charge le skill i2i-avatar-creator-base depuis ./skills/.
    Toujours chargé dynamiquement (jamais hardcodé).
    """
    base = Path("./skills/i2i-avatar-creator-base")

    # Vérifier que le skill existe
    if not (base / "SKILL.md").exists():
        raise FileNotFoundError(
            f"Skill i2i-avatar-creator-base introuvable dans {base.absolute()}. "
            "Vérifier que ./skills/i2i-avatar-creator-base/ existe."
        )

    parts = [
        (base / "SKILL.md").read_text(),
        "\n\n---\n## identity-preservation.md\n",
        (base / "references/identity-preservation.md").read_text(),
        "\n\n---\n## vocabulary-banks.md\n",
        (base / "references/vocabulary-banks.md").read_text(),
        "\n\n---\n## style-templates.md\n",
        (base / "references/style-templates.md").read_text(),
        "\n\n---\n## example-scenes.md\n",
        (base / "references/example-scenes.md").read_text(),
        """

---
## CONTEXTE PIPELINE AUTOMATIQUE

Tu analyses des images de carousels Instagram.
Génère UN SEUL prompt pour la slide la plus représentative du carousel.
NE PAS inclure <<<UUID>>> dans le prompt (le pipeline l'injecte selon le modèle).
Recommande le modèle optimal parmi : soul_cinematic / seedream_v4_5 / nano_banana_2

Réponse en JSON strict UNIQUEMENT, aucun texte autour :
{
  "best_slide_index": 0,
  "recommended_model": "soul_cinematic",
  "scene_description": "description courte de la scène en français",
  "prompt": "Ultra-realistic [type] of the same woman shown in the reference image(s)..."
}
"""
    ]
    return "".join(parts)


def encode_image(path: str) -> str:
    """Encode une image en base64."""
    return base64.b64encode(Path(path).read_bytes()).decode()


def analyze_carousel(slides: list[str], anthropic_key: str) -> dict:
    """Analyse un carousel et génère un prompt Higgsfield.

    Args:
        slides: Liste de chemins locaux vers les images (max 10 recommandé, max 20)
        anthropic_key: Clé API Anthropic

    Returns:
        dict avec best_slide_index, recommended_model, scene_description, prompt
    """
    # Respecter la limite de 20 images / appel Claude (recommandé : 10)
    slides_to_use = slides[:10]

    client = anthropic.Anthropic(api_key=anthropic_key)

    content = []
    for path in slides_to_use:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": encode_image(path)
            }
        })

    content.append({
        "type": "text",
        "text": f"Carousel de {len(slides_to_use)} slides. Génère le prompt pour la meilleure slide."
    })

    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=load_i2i_skill(),
        messages=[{"role": "user", "content": content}]
    )

    raw = resp.content[0].text.strip()

    # Parser le JSON (Claude peut parfois ajouter des backticks)
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    result = json.loads(raw.strip())

    # Valider les champs requis
    required = ["best_slide_index", "recommended_model", "scene_description", "prompt"]
    for field in required:
        if field not in result:
            raise ValueError(f"Champ manquant dans la réponse Claude: {field}")

    return result


async def analyze_all_carousels(
    carousel_data: list[dict],
    anthropic_key: str,
) -> list[dict]:
    """Analyse tous les carousels séquentiellement (pas de parallélisation pour Claude).
    Émet des événements JSON sur stdout.

    Args:
        carousel_data: Liste de {post, local_images}
        anthropic_key: Clé API Anthropic

    Returns:
        Liste de {post, local_images, analysis} ou {post, local_images, analysis_error}
    """
    results = []
    total = len(carousel_data)

    for i, item in enumerate(carousel_data):
        post = item["post"]
        shortcode = post.get("shortCode", f"post_{i}")
        slides = item["local_images"]

        try:
            analysis = analyze_carousel(slides, anthropic_key)
            item["analysis"] = analysis
            print(json.dumps({
                "type": "analysis",
                "processed": i + 1,
                "total": total,
                "shortcode": shortcode,
                "recommended_model": analysis["recommended_model"],
                "scene": analysis["scene_description"]
            }), flush=True)
        except Exception as e:
            item["analysis_error"] = str(e)
            print(json.dumps({
                "type": "analysis_error",
                "processed": i + 1,
                "total": total,
                "shortcode": shortcode,
                "error": str(e)
            }), flush=True)

        results.append(item)

    return results
