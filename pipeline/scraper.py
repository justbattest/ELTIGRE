"""
Apify Instagram scraper — carousels triés par engagement (likes + comments).
Téléchargement immédiat des images (URLs CDN expirent rapidement).

Actor utilisé : apify/instagram-post-scraper (99.9% success rate, 94k users)
Plus fiable que apify/instagram-scraper qui se fait bloquer sur certains profils.
"""

import asyncio
import httpx
import json
import re
from pathlib import Path
from apify_client import ApifyClient


def clean_instagram_url(url: str) -> str:
    """Nettoie une URL Instagram : supprime les query params (?igsh=...) et fragments.
    Exemples :
      https://www.instagram.com/emma?igsh=xxx  →  https://www.instagram.com/emma/
      https://www.instagram.com/p/ABC/?hl=fr   →  https://www.instagram.com/p/ABC/
    """
    url = re.sub(r'[?#].*$', '', url.strip())
    if not url.endswith('/'):
        url += '/'
    return url


def scrape_profile(profile_url: str, max_posts: int, apify_key: str) -> list:
    """Scrape les carousels d'un profil Instagram via Apify.
    Utilise apify/instagram-post-scraper (plus fiable, 99.9% success rate).
    Retourne les carousels triés par engagement DESC.
    """
    clean_url = clean_instagram_url(profile_url)
    client = ApifyClient(apify_key)

    # Actor officiel Apify v2 — supporte URLs directes et usernames
    # detailedData = retourne toutes les images du carousel (childPosts inclus)
    run = client.actor("apify/instagram-post-scraper").call(run_input={
        "username": [clean_url],
        "resultsLimit": max_posts,
        "dataDetailLevel": "detailedData",
    })

    # apify-client v3 : objet Pydantic, accès via attribut snake_case
    dataset_id = run.default_dataset_id
    items = list(client.dataset(dataset_id).iterate_items())

    # Filtrer les erreurs (profils bloqués, privés)
    valid_items = []
    for item in items:
        if item.get("error") or item.get("requestErrorMessages"):
            err = item.get("error") or (item.get("requestErrorMessages") or [""])[0][:100]
            print(json.dumps({"type": "warn", "msg": f"Profile skipped: {err}"}), flush=True)
            continue
        valid_items.append(item)

    # Carousels uniquement — type "Sidecar" (nouveau) ou "GraphSidecar" (ancien)
    # Fallback : tout post avec 2+ images compte comme carousel
    CAROUSEL_TYPES = {"GraphSidecar", "Sidecar"}
    carousels = [
        p for p in valid_items
        if p.get("type") in CAROUSEL_TYPES or len(p.get("images", [])) > 1
    ]
    carousels.sort(
        key=lambda p: p.get("likesCount", 0) + p.get("commentsCount", 0),
        reverse=True
    )
    return carousels


def _get_image_url(img) -> str | None:
    """Extrait l'URL d'une image — gère str (nouveau Apify) et dict{"src":...} (ancien)."""
    if isinstance(img, str):
        return img
    if isinstance(img, dict):
        return img.get("src") or img.get("url") or img.get("imageUrl") or img.get("displayUrl")
    return None


def _extract_slide_urls(post: dict) -> list[str]:
    """Extrait toutes les URLs de slides d'un carousel.

    Stratégie (par ordre de préférence) :
    1. post["images"]  — liste de strings URLs (format nouveau actor)
    2. post["childPosts"][*]["displayUrl"]  — slides individuelles
    3. post["displayUrl"]  — image principale (fallback single image)
    """
    # 1. Champ images direct
    raw_images = post.get("images", [])
    urls = [u for img in raw_images if (u := _get_image_url(img))]
    if urls:
        return urls

    # 2. childPosts (slides du carousel)
    child_posts = post.get("childPosts", [])
    if child_posts:
        child_urls = []
        for child in child_posts:
            u = child.get("displayUrl") or _get_image_url(child.get("images", [None])[0] if child.get("images") else None)
            if u:
                child_urls.append(u)
        if child_urls:
            return child_urls

    # 3. Fallback : image principale uniquement
    if post.get("displayUrl"):
        return [post["displayUrl"]]

    return []


async def download_carousel(post: dict, run_dir: str) -> list[str]:
    """Télécharge toutes les slides d'un carousel.
    Retourne les chemins locaux des images téléchargées.
    IMPORTANT: télécharger immédiatement — les URLs CDN expirent rapidement.
    """
    shortcode = post.get("shortCode") or post.get("shortcode") or "unknown"
    folder = Path(run_dir) / "images" / shortcode
    folder.mkdir(parents=True, exist_ok=True)
    paths = []

    image_urls = _extract_slide_urls(post)
    if not image_urls:
        print(json.dumps({"type": "warn", "msg": f"No images found for {shortcode}"}), flush=True)
        return []

    async with httpx.AsyncClient(timeout=30) as client:
        for i, url in enumerate(image_urls):
            path = folder / f"slide_{i:02d}.jpg"
            if path.exists():
                paths.append(str(path))
                continue
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                path.write_bytes(resp.content)
                paths.append(str(path))
            except Exception as e:
                print(json.dumps({"type": "warn", "msg": f"download failed slide {i} for {shortcode}: {e}"}), flush=True)

    return paths


async def scrape_and_download_all(
    profile_url: str,
    max_posts: int,
    apify_key: str,
    run_dir: str,
) -> list[dict]:
    """Pipeline complet : scrape + download pour un profil.
    Retourne une liste de dicts {post, local_images}.
    Émet des événements JSON sur stdout pour le monitoring.
    """
    print(json.dumps({"type": "phase", "phase": "scraping", "pct": 0}), flush=True)

    carousels = scrape_profile(profile_url, max_posts, apify_key)

    print(json.dumps({
        "type": "phase",
        "phase": "scraping",
        "pct": 100,
        "total_carousels": len(carousels),
        "profile": profile_url,
    }), flush=True)

    if not carousels:
        print(json.dumps({
            "type": "error",
            "msg": f"Aucun carousel trouvé pour {profile_url}. Profil privé, bloqué ou sans carousel.",
        }), flush=True)
        return []

    print(json.dumps({"type": "phase", "phase": "downloading", "pct": 0}), flush=True)

    results = []
    tasks = [download_carousel(post, run_dir) for post in carousels]
    downloaded = await asyncio.gather(*tasks, return_exceptions=True)

    for i, (post, paths) in enumerate(zip(carousels, downloaded)):
        if isinstance(paths, Exception):
            sc = post.get('shortCode') or post.get('shortcode')
            print(json.dumps({"type": "warn", "msg": f"download error for {sc}: {paths}"}), flush=True)
            paths = []
        if paths:  # Seulement si au moins 1 image téléchargée
            results.append({"post": post, "local_images": paths})

    print(json.dumps({
        "type": "phase",
        "phase": "downloading",
        "pct": 100,
        "total_images": sum(len(r["local_images"]) for r in results),
    }), flush=True)

    return results
