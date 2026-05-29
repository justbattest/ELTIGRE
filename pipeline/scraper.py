"""
Instagram scraper — posts triés par engagement (likes + comments).
Téléchargement immédiat des images (URLs CDN expirent rapidement).

Trois modes (par ordre de priorité) :
1. AVEC cookie → instagrapi  (API mobile exacte d'Instagram, TOUS profils publics y compris Restricted)
2. AVEC cookie, si instagrapi échoue → Instaloader (fallback)
3. SANS cookie  → apify/instagram-scraper + proxies résidentiels (profils non-restreints)

On scrape TOUS les posts (images simples + carousels confondus).
La seule règle : avoir au moins 1 image et un max d'engagement.
"""

import asyncio
import httpx
import itertools
import json
import re
import urllib.parse
from pathlib import Path
from apify_client import ApifyClient


def clean_instagram_url(url: str) -> str:
    """Nettoie une URL Instagram : supprime les query params (?igsh=...) et fragments."""
    url = re.sub(r'[?#].*$', '', url.strip())
    if not url.endswith('/'):
        url += '/'
    return url


def extract_username(url: str) -> str:
    """Extrait le username depuis une URL Instagram.
    Ex: https://www.instagram.com/secrettluxe/ → secrettluxe
    """
    clean = clean_instagram_url(url)
    username = re.sub(r'^https?://(www\.)?instagram\.com/', '', clean).strip('/')
    return username


# ── Mode instagrapi (avec cookie de session — API mobile Instagram) ────────────

def scrape_profile_instagrapi(profile_url: str, max_posts: int, session_cookie: str) -> list:
    """Scrape via instagrapi — utilise l'API mobile exacte d'Instagram (app headers iOS/Android).
    Fonctionne sur TOUS les profils publics y compris les "Restricted" qui nécessitent un login.
    """
    from instagrapi import Client
    import warnings
    warnings.filterwarnings("ignore")  # Supprime les warnings instagrapi non critiques

    username = extract_username(profile_url)
    decoded_cookie = urllib.parse.unquote(session_cookie.strip())

    print(json.dumps({
        "type": "info",
        "msg": f"instagrapi: scraping @{username} (API mobile authentifiée)"
    }), flush=True)

    cl = Client()
    cl.delay_range = [1, 2]  # Délai naturel entre requêtes

    try:
        cl.login_by_sessionid(decoded_cookie)
    except Exception as e:
        raise RuntimeError(f"instagrapi login failed: {e}")

    try:
        user_id = cl.user_id_from_username(username)
    except Exception as e:
        raise RuntimeError(f"instagrapi user lookup failed for @{username}: {e}")

    # Récupérer plus de posts que demandé pour compenser le filtrage des vidéos.
    # On estime ~40% de vidéos en moyenne sur Instagram → on fetch 2x pour avoir assez d'images.
    fetch_count = min(max_posts * 2, max_posts + 30)
    medias = []
    try:
        medias = cl.user_medias_v1(user_id, fetch_count)
    except Exception as e:
        raise RuntimeError(f"instagrapi medias failed for @{username}: {e}")

    # Collecter TOUS les posts avec image depuis fetch_count (pas de break anticipé).
    # On trie par engagement APRÈS avoir tout collecté → on prend les meilleurs max_posts.
    posts = []
    skipped = 0
    for media in medias:
        # Ignorer les vidéos simples (media_type=2), garder images (1) et carousels (8)
        if media.media_type == 2:
            skipped += 1
            continue
        post_dict = _instagrapi_media_to_dict(media)
        if post_dict.get("images") or post_dict.get("displayUrl"):
            posts.append(post_dict)
        else:
            skipped += 1

    # Tri par engagement DESC (likes + comments × 3) — même formule que le mode Apify
    posts.sort(
        key=lambda p: (p.get("likesCount") or 0) + (p.get("commentsCount") or 0) * 3,
        reverse=True
    )
    # Garder uniquement les meilleurs max_posts
    posts = posts[:max_posts]

    print(json.dumps({
        "type": "info",
        "msg": f"instagrapi: {len(medias)} fetchés → {len(posts)} meilleurs par engagement ({skipped} vidéos filtrées)"
    }), flush=True)

    return posts


def _instagrapi_media_to_dict(media) -> dict:
    """Convertit un objet instagrapi Media en dict compatible avec notre pipeline."""
    images = []

    if media.media_type == 8:
        # Carousel — récupérer toutes les slides
        for resource in (media.resources or []):
            if resource.thumbnail_url:
                images.append(str(resource.thumbnail_url))
    elif media.media_type == 1:
        # Image simple
        if media.thumbnail_url:
            images.append(str(media.thumbnail_url))

    display_url = images[0] if images else (str(media.thumbnail_url) if media.thumbnail_url else None)

    return {
        "shortCode": media.code,
        "type": {1: "Image", 2: "Video", 8: "Sidecar"}.get(media.media_type, "Image"),
        "likesCount": media.like_count or 0,
        "commentsCount": media.comment_count or 0,
        "caption": media.caption_text or "",
        "url": f"https://www.instagram.com/p/{media.code}/",
        "displayUrl": display_url,
        "images": images,
        "timestamp": media.taken_at.isoformat() if media.taken_at else None,
        "ownerUsername": username_from_media(media),
    }


def username_from_media(media) -> str:
    """Extrait le username depuis un objet media instagrapi (plusieurs formats possibles)."""
    try:
        return media.user.username
    except Exception:
        return ""


# ── Mode Instaloader (avec cookie de session — fallback) ───────────────────────

def scrape_profile_instaloader(profile_url: str, max_posts: int, session_cookie: str) -> list:
    """Scrape via Instaloader avec cookie de session Instagram.
    Fonctionne sur TOUS les profils publics, même les "Restricted".

    Le cookie Chrome est URL-encodé (%3A = :) — on URL-décode avant usage.
    """
    import instaloader  # Import local pour ne pas crasher si non installé sans cookie

    username = extract_username(profile_url)
    # URL-décoder le cookie (Chrome stocke la valeur encodée)
    decoded_cookie = urllib.parse.unquote(session_cookie.strip())

    print(json.dumps({
        "type": "info",
        "msg": f"Instaloader: scraping @{username} (mode authentifié)"
    }), flush=True)

    L = instaloader.Instaloader(
        download_videos=False,
        download_video_thumbnails=False,
        compress_json=False,
        save_metadata=False,
        quiet=True,
        user_agent=None,  # Utilise le user-agent par défaut d'Instaloader
    )

    # Injecter le cookie de session Instagram
    L.context._session.cookies.set("sessionid", decoded_cookie, domain=".instagram.com")
    # ds_user_id = premier segment du sessionid (ex: "71400275246:..." → "71400275246")
    user_id_part = decoded_cookie.split(":")[0] if ":" in decoded_cookie else ""
    if user_id_part.isdigit():
        L.context._session.cookies.set("ds_user_id", user_id_part, domain=".instagram.com")

    try:
        profile = instaloader.Profile.from_username(L.context, username)
    except instaloader.exceptions.ProfileNotExistsException:
        # Profil inexistant → erreur définitive, pas de fallback utile
        print(json.dumps({"type": "error", "msg": f"Profil @{username} introuvable sur Instagram"}), flush=True)
        return []
    except instaloader.exceptions.LoginRequiredException:
        # Cookie invalide/expiré → laisser remonter pour fallback Apify
        raise
    except Exception:
        # Erreur réseau/403/400 → laisser remonter pour fallback Apify
        raise

    posts = []
    skipped_videos = 0

    # Fetcher 2× plus que demandé pour compenser le filtrage vidéo et pouvoir trier par engagement
    fetch_count = min(max_posts * 2, max_posts + 30)

    try:
        for post in itertools.islice(profile.get_posts(), fetch_count):
            # Ignorer les vidéos pures
            if post.typename == "GraphVideo":
                skipped_videos += 1
                continue

            post_dict = _instaloader_post_to_dict(post)
            if post_dict.get("images") or post_dict.get("displayUrl"):
                posts.append(post_dict)
            else:
                skipped_videos += 1
    except Exception:
        # Erreur pendant la récupération des posts (403, rate limit...) → fallback Apify
        if posts:
            print(json.dumps({
                "type": "info",
                "msg": f"Instaloader: erreur en cours de scraping — retourne {len(posts)} posts déjà récupérés"
            }), flush=True)
        else:
            raise  # Aucun post → laisser remonter pour fallback Apify

    # Tri par engagement DESC, puis garder les meilleurs max_posts
    posts.sort(
        key=lambda p: (p.get("likesCount") or 0) + (p.get("commentsCount") or 0) * 3,
        reverse=True
    )
    posts = posts[:max_posts]

    print(json.dumps({
        "type": "info",
        "msg": f"Instaloader: {len(posts) + skipped_videos} fetchés → {len(posts)} meilleurs par engagement ({skipped_videos} vidéos filtrées)"
    }), flush=True)

    return posts


def _instaloader_post_to_dict(post) -> dict:
    """Convertit un objet instaloader.Post en dict compatible avec notre pipeline."""
    images = []

    if post.typename == "GraphSidecar":
        # Carousel — récupérer toutes les slides
        try:
            for node in post.get_sidecar_nodes():
                if not node.is_video:
                    images.append(node.display_url)
        except Exception:
            if post.url:
                images.append(post.url)
    else:
        # Image simple
        if post.url:
            images.append(post.url)

    return {
        "shortCode": post.shortcode,
        "type": post.typename.replace("Graph", ""),  # GraphSidecar → Sidecar
        "likesCount": post.likes if post.likes else 0,
        "commentsCount": post.comments if post.comments else 0,
        "caption": post.caption or "",
        "url": f"https://www.instagram.com/p/{post.shortcode}/",
        "displayUrl": images[0] if images else post.url,
        "images": images,
        "timestamp": post.date_utc.isoformat() if post.date_utc else None,
        "ownerUsername": post.owner_username,
    }


# ── Mode Apify (sans cookie, profils non-restreints) ───────────────────────────

def scrape_profile_apify(profile_url: str, max_posts: int, apify_key: str) -> list:
    """Scrape via apify/instagram-scraper (browser Chromium + proxies résidentiels).
    Meilleur taux de succès sur les profils restreints que le post-scraper HTTP.
    """
    clean_url = clean_instagram_url(profile_url)
    client = ApifyClient(apify_key)

    print(json.dumps({
        "type": "info",
        "msg": f"Apify: scraping {clean_url} (mode non-authentifié)"
    }), flush=True)

    run = client.actor("apify/instagram-scraper").call(run_input={
        "directUrls": [clean_url],
        "resultsType": "posts",
        "resultsLimit": max_posts,
        "addParentData": False,
        "proxy": {
            "useApifyProxy": True,
            "apifyProxyGroups": ["RESIDENTIAL"],
        },
    })

    dataset_id = run.default_dataset_id
    items = list(client.dataset(dataset_id).iterate_items())
    raw_count = len(items)

    valid_posts = []
    skipped_no_image = 0
    for item in items:
        if item.get("error") or item.get("requestErrorMessages"):
            err = (item.get("requestErrorMessages") or [""])[0][:100]
            print(json.dumps({"type": "warn", "msg": f"Post skipped: {err}"}), flush=True)
            continue
        if not item.get("images") and not item.get("displayUrl"):
            skipped_no_image += 1
            continue
        valid_posts.append(item)

    print(json.dumps({
        "type": "info",
        "msg": f"Apify: {raw_count} posts bruts → {len(valid_posts)} avec image "
               f"({skipped_no_image} vidéos/reels filtrés, "
               f"{raw_count - len(valid_posts) - skipped_no_image} erreurs)",
    }), flush=True)

    # Log diagnostic des likes pour les 3 premiers posts
    for p in valid_posts[:3]:
        sc = p.get("shortCode", "?")
        print(json.dumps({
            "type": "info",
            "msg": f"Post {sc}: likesCount={p.get('likesCount')} "
                   f"commentsCount={p.get('commentsCount')} type={p.get('type')}",
        }), flush=True)

    # Tri par engagement DESC
    valid_posts.sort(
        key=lambda p: (p.get("likesCount") or 0) + (p.get("commentsCount") or 0),
        reverse=True
    )
    return valid_posts


# ── Dispatcher principal ────────────────────────────────────────────────────────

def scrape_profile(
    profile_url: str,
    max_posts: int,
    apify_key: str,
    session_cookie: str | None = None,
) -> list:
    """Point d'entrée — cascade de méthodes :
    1. Cookie → instagrapi (API mobile, TOUS profils)
    2. Cookie → Instaloader (fallback si instagrapi échoue)
    3. Pas de cookie → Apify (proxies résidentiels)
    """
    if session_cookie:
        # ── Essai 1 : instagrapi (API mobile authentifiée) ──
        try:
            posts = scrape_profile_instagrapi(profile_url, max_posts, session_cookie)
            if posts:
                return posts
            print(json.dumps({"type": "info", "msg": "instagrapi: 0 posts — fallback Instaloader"}), flush=True)
        except Exception as e:
            print(json.dumps({
                "type": "info",
                "msg": f"instagrapi échoué ({type(e).__name__}: {str(e)[:100]}) — fallback Instaloader"
            }), flush=True)

        # ── Essai 2 : Instaloader (fallback) ──
        try:
            posts = scrape_profile_instaloader(profile_url, max_posts, session_cookie)
            if posts:
                return posts
            print(json.dumps({"type": "info", "msg": "Instaloader: 0 posts — fallback Apify"}), flush=True)
        except Exception as e:
            print(json.dumps({
                "type": "info",
                "msg": f"Instaloader échoué ({type(e).__name__}: {str(e)[:100]}) — fallback Apify"
            }), flush=True)

    # ── Essai 3 : Apify + proxies résidentiels ──
    return scrape_profile_apify(profile_url, max_posts, apify_key)


# ── Extraction d'images ─────────────────────────────────────────────────────────

def _get_image_url(img) -> str | None:
    """Extrait l'URL d'une image — gère str et dict {"src":...}."""
    if isinstance(img, str):
        return img
    if isinstance(img, dict):
        return img.get("src") or img.get("url") or img.get("imageUrl") or img.get("displayUrl")
    return None


def _extract_slide_urls(post: dict) -> list[str]:
    """Extrait toutes les URLs d'images d'un post.

    Stratégie :
    1. post["images"]     — liste directe (Apify + Instaloader)
    2. post["childPosts"] — slides carousel (ancien format Apify)
    3. post["displayUrl"] — image principale (fallback)
    """
    raw_images = post.get("images", [])
    urls = [u for img in raw_images if (u := _get_image_url(img))]
    if urls:
        return urls

    child_posts = post.get("childPosts", [])
    if child_posts:
        child_urls = []
        for child in child_posts:
            u = child.get("displayUrl") or _get_image_url(
                child.get("images", [None])[0] if child.get("images") else None
            )
            if u:
                child_urls.append(u)
        if child_urls:
            return child_urls

    if post.get("displayUrl"):
        return [post["displayUrl"]]

    return []


# ── Download ────────────────────────────────────────────────────────────────────

async def download_post(post: dict, run_dir: str) -> list[str]:
    """Télécharge toutes les images d'un post.
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

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
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
                print(json.dumps({
                    "type": "warn",
                    "msg": f"download failed slide {i} for {shortcode}: {e}"
                }), flush=True)

    return paths


async def scrape_and_download_all(
    profile_url: str,
    max_posts: int,
    apify_key: str,
    run_dir: str,
    session_cookie: str | None = None,
) -> list[dict]:
    """Pipeline complet : scrape + download pour un profil.
    Retourne une liste de dicts {post, local_images}.
    Émet des événements JSON sur stdout pour le monitoring.
    """
    print(json.dumps({"type": "phase", "phase": "scraping", "pct": 0}), flush=True)

    posts = scrape_profile(profile_url, max_posts, apify_key, session_cookie=session_cookie)

    is_carousel = lambda p: p.get("type") in ("Sidecar", "GraphSidecar") or len(p.get("images", [])) > 1
    n_carousels = sum(1 for p in posts if is_carousel(p))
    n_singles = len(posts) - n_carousels

    # NOTE : on utilise "profile_posts" (pas "total_posts") pour éviter que le UI
    # écrase le compteur global avec le résultat d'un seul profil.
    # Le total cumulatif est émis par queue_manager.py après tous les profils.
    print(json.dumps({
        "type": "phase",
        "phase": "scraping",
        "pct": 100,
        "profile_posts": len(posts),
        "total_carousels": n_carousels,
        "total_singles": n_singles,
        "profile": profile_url,
    }), flush=True)

    if not posts:
        msg = (
            f"Aucun post avec image trouvé pour {profile_url}. "
            + ("Cookie de session invalide ou expiré — recopy-le depuis Chrome → Instagram → F12 → Application → Cookies → sessionid."
               if session_cookie
               else "Profil bloqué ou restreint par Instagram. Ajoute ton cookie de session Instagram dans Settings pour débloquer tous les profils.")
        )
        # "warn" et non "error" : le pipeline continue avec les autres profils.
        # Un seul profil vide ne doit pas marquer tout le run comme échoué.
        print(json.dumps({"type": "warn", "msg": msg}), flush=True)
        return []

    print(json.dumps({"type": "phase", "phase": "downloading", "pct": 0}), flush=True)

    results = []
    tasks = [download_post(post, run_dir) for post in posts]
    downloaded = await asyncio.gather(*tasks, return_exceptions=True)

    for i, (post, paths) in enumerate(zip(posts, downloaded)):
        if isinstance(paths, Exception):
            sc = post.get('shortCode') or post.get('shortcode')
            print(json.dumps({"type": "warn", "msg": f"download error for {sc}: {paths}"}), flush=True)
            paths = []
        if paths:
            results.append({"post": post, "local_images": paths})

    print(json.dumps({
        "type": "phase",
        "phase": "downloading",
        "pct": 100,
        "total_images": sum(len(r["local_images"]) for r in results),
    }), flush=True)

    return results
