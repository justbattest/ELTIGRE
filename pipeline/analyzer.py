"""
Analyse Claude API + skill i2i-avatar-creator-base.
Génère un prompt Higgsfield pour la meilleure image d'un post Instagram.
Fonctionne aussi bien pour les images simples que les carousels multi-slides.
"""

import io
import json
import re
import base64
from pathlib import Path
import anthropic


def load_i2i_skill() -> str:
    """Charge le skill i2i-avatar-creator-base complet depuis ./skills/.

    On charge les 5 fichiers pour maximiser la qualité des prompts générés.
    Avec le prompt caching Anthropic (cache_control ephemeral, TTL 5 min),
    le surcoût des 14k tokens supplémentaires est négligeable après le 1er appel :
    - example-scenes.md : 15 exemples complets → guident fortement le niveau de détail
    - vocabulary-banks.md : banques de marques, imperfections, specs caméra → spécificité
    - Les 5 fichiers ensemble (~27k tokens) sont cachés → paiement 10% sur les suivants

    Tokens estimés : ~27 000 (vs ~13 000 en version pruned)
    Coût avec cache : ~10% du coût d'un appel non-caché pour les appels 2+
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
## CONTEXTE PIPELINE AUTOMATIQUE

Tu analyses des images Instagram (image seule ou carousel multi-slides).
Génère UN SEUL prompt pour l'image ou la slide la plus représentative.
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


def encode_image(path: str, max_size: int = 512) -> str:
    """Encode une image en base64, redimensionnée à max_size px (côté le plus long).

    Pourquoi redimensionner ?
    - Instagram stocke les images en 1080×1080 → ~1 500 tokens Claude chacune
    - À 512×512 → ~350 tokens → 75% de moins sur le coût image
    - La qualité visuelle pour l'analyse de scène est identique à cette résolution
    """
    try:
        from PIL import Image
        img = Image.open(path)
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        # Fallback sans resize si PIL échoue
        return base64.b64encode(Path(path).read_bytes()).decode()


def _safe_json_loads(raw: str) -> dict:
    """Parse JSON depuis la réponse Claude avec nettoyage des erreurs courantes.

    Problèmes fréquents avec Haiku :
    1. Caractères de contrôle littéraux dans les strings JSON (\\n, \\t non échappés)
       → "Invalid control character" à json.loads
    2. JSON tronqué si max_tokens trop bas → "Unterminated string"

    Stratégie :
    - Essai direct d'abord
    - Si échec : sanitize les caractères de contrôle dans les valeurs string JSON
    """
    # Essai 1 : parse direct
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Essai 2 : remplacer les caractères de contrôle littéraux hors des structures JSON
    # On remplace \n, \r, \t par leurs versions échappées JSON à l'intérieur des strings
    def escape_control_chars(m):
        s = m.group(0)
        s = s.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
        return s

    # Trouve toutes les strings JSON (entre guillemets) et échappe leur contenu
    cleaned = re.sub(r'"(?:[^"\\]|\\.)*"', escape_control_chars, raw, flags=re.DOTALL)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Essai 3 : suppression brute des caractères de contrôle (sauf \n \r \t déjà gérés)
    cleaned2 = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', raw)
    return json.loads(cleaned2)


def analyze_post(slides: list[str], anthropic_key: str) -> dict:
    """Analyse un post Instagram (1 image ou plusieurs slides) et génère un prompt Higgsfield.

    Args:
        slides: Liste de chemins locaux vers les images (max 10)
        anthropic_key: Clé API Anthropic

    Returns:
        dict avec best_slide_index, recommended_model, scene_description, prompt

    Qualité vs coût :
    - Modèle : claude-sonnet-4-5 — génère des prompts avec la spécificité nécessaire
      (marques, imperfections, specs caméra) pour défaire le look IA. Haiku produit des
      prompts trop génériques sur un skill aussi complexe.
    - Prompt caching (cache_control ephemeral, TTL 5 min) : les ~27k tokens sont mis en cache
      → appels suivants paient ~10% du coût normal. Estimé ~$5/200 posts avec caching.
    - max_tokens=1500 : prompts Higgsfield longs (400-600 tokens) + JSON wrapper.
    """
    # Max 2 slides envoyées à Claude — suffisant pour choisir la meilleure scène,
    # et réduit le coût image de ~75% par rapport à envoyer tout le carousel (jusqu'à 10 slides).
    slides_to_use = slides[:2]
    n = len(slides_to_use)

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

    no_physical_desc = """
⚠️ RÈGLES ABSOLUES — À appliquer dans le champ "prompt" généré :
- NE JAMAIS décrire les caractéristiques physiques de la personne : couleur de cheveux, couleur des yeux, teinte de peau, morphologie, taille, corpulence, forme du visage, ou tout autre trait physique.
- Ces éléments sont définis automatiquement par le Soul et le Reference Element Higgsfield. Le modèle les applique lui-même.
- Dans le prompt, référencer le personnage uniquement comme "the woman" ou "the character", sans AUCUN adjectif physique (pas de "blonde", "brunette", "fair-skinned", "slender", etc.).
- Décrire UNIQUEMENT : la tenue/vêtements (couleurs, matières, style), le décor/environnement, la composition/cadrage, l'éclairage, l'ambiance/mood, les accessoires non-corporels.
- INTERDICTION ABSOLUE des tatouages : ne jamais mentionner ni inclure de tatouages dans le prompt. Si le modèle source en a, les ignorer totalement. Le personnage généré ne doit JAMAIS avoir de tatouages.
"""
    if n == 1:
        content.append({
            "type": "text",
            "text": f"Image Instagram (post simple). Génère le prompt pour cette image.\n{no_physical_desc}"
        })
    else:
        content.append({
            "type": "text",
            "text": f"Carousel Instagram de {n} slides. Génère le prompt pour la meilleure slide.\n{no_physical_desc}"
        })

    # Sonnet pour la qualité des prompts : génère des descriptions plus spécifiques (marques,
    # imperfections, specs iPhone précises) qui défont le look IA vs Haiku.
    # Prompt caching : les ~27k tokens du system prompt sont cachés 5 min → ~90% d'économie
    # sur les appels suivants. Coût estimé avec caching : ~$5/200 posts (vs $20+ sans cache).
    # max_tokens=1500 : les prompts Higgsfield longs (400-600 tokens) + JSON wrapper.
    resp = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1500,
        system=[
            {
                "type": "text",
                "text": load_i2i_skill(),
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": content}]
    )

    raw = resp.content[0].text.strip()

    # Strip éventuels blocs markdown (```json ... ```)
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    result = _safe_json_loads(raw)

    required = ["best_slide_index", "recommended_model", "scene_description", "prompt"]
    for field in required:
        if field not in result:
            raise ValueError(f"Champ manquant dans la réponse Claude: {field}")

    return result


async def analyze_all_posts(
    post_data: list[dict],
    anthropic_key: str,
) -> list[dict]:
    """Analyse tous les posts séquentiellement.
    Émet des événements JSON sur stdout.

    Args:
        post_data: Liste de {post, local_images}
        anthropic_key: Clé API Anthropic

    Returns:
        Liste de {post, local_images, analysis} ou {post, local_images, analysis_error}
    """
    results = []
    total = len(post_data)

    for i, item in enumerate(post_data):
        post = item["post"]
        shortcode = post.get("shortCode", f"post_{i}")
        slides = item["local_images"]

        try:
            analysis = analyze_post(slides, anthropic_key)
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


# Backwards-compat alias
analyze_all_carousels = analyze_all_posts
