"""
Carousel Variations — génère 3 variations img2img (SoulCinema) par photo uploadée.

Pipeline par photo :
  1. Claude Vision (haiku) analyse la photo → génère 3 prompts de variation
     (même décor/ambiance/éclairage, pose/angle/focus différent)
  2. Higgsfield SoulCinema img2img génère 3 images (--image <original> --soul-id <uuid>)
  3. optimize_image_bytes() sur les 4 images (original + 3 générées)
  4. Upload Drive : {character}/carousels/{runId}/carousel_N/{1,2,3,4}.jpg

Protocole stdout JSON lines (même format que carousel_creator.py) :
  {"type": "info", "msg": "..."}
  {"type": "carousel_start", "total": N, "image_count": N}
  {"type": "carousel", "n": N, "total": N, "drive_urls": [...], "errors": null}
  {"type": "done", "run_id": "...", "total": N}
  {"type": "error", "message": "..."}
"""

import asyncio
import base64
import httpx
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from pipeline.metadata_optimizer import optimize_image_bytes


# ── Semaphore cross-process Higgsfield ───────────────────────────────────────
# Utilise des fichiers lock dans /tmp/hf_slots/ pour coordonner entre plusieurs
# subprocesses Railway (ex: Emma + Nina lancés simultanément).
# Chaque "slot" = un fichier slot_N.lock contenant le PID du process qui le tient.
# O_CREAT|O_EXCL = atomique sur Linux → pas de race condition.

HF_GLOBAL_MAX = 6          # max jobs Higgsfield simultanés TOUS processes confondus
_HF_SLOT_DIR = "/tmp/hf_slots"


def _cleanup_stale_hf_slots() -> None:
    """Supprime les slots dont le PID n'est plus actif (crash recovery)."""
    slot_dir = Path(_HF_SLOT_DIR)
    if not slot_dir.exists():
        return
    for slot in slot_dir.glob("slot_*.lock"):
        try:
            pid = int(slot.read_text().strip())
            os.kill(pid, 0)  # signal 0 = vérifier existence seulement
        except (ValueError, ProcessLookupError):
            try: slot.unlink()
            except: pass
        except Exception:
            pass


async def _acquire_hf_slot() -> Path:
    """Acquiert 1 slot parmi HF_GLOBAL_MAX (cross-process). Attend si tous pris."""
    slot_dir = Path(_HF_SLOT_DIR)
    slot_dir.mkdir(exist_ok=True)
    _cleanup_stale_hf_slots()

    while True:
        for i in range(HF_GLOBAL_MAX):
            slot_path = slot_dir / f"slot_{i}.lock"
            try:
                fd = os.open(str(slot_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode())
                os.close(fd)
                return slot_path
            except FileExistsError:
                continue
        await asyncio.sleep(2)   # tous les slots pris → attendre sans bloquer l'event loop


def _release_hf_slot(slot_path: Path) -> None:
    try: slot_path.unlink()
    except Exception: pass


# Token cache + refresh partagés — module hf_token.py
from pipeline.hf_token import (
    _hf_token_cache,
    _get_token_lock,
    refresh_hf_access_token as _refresh_hf_access_token,
    is_session_expired as _is_session_expired,
)


# ── Prompt template (Carousel Completer) ──────────────────────────────────────

VARIATION_SYSTEM = """You are an expert in creating Instagram carousel content.
Given a reference photo, generate 3 complementary slide prompts.
Rules:
- Maintain the EXACT same location, decor, lighting, color palette, and ambiance as the original
- Only change: pose, camera angle, or body part / detail focus
- Keep prompts concise (1-2 sentences), professional fashion photography style, in English
Return ONLY valid JSON: {"variations": ["prompt 1", "prompt 2", "prompt 3"]}"""

# 3 distinct variation types for carousel narrative continuity
VARIATION_ANGLES = [
    "wider establishing shot showing the full environment",
    "close-up detail shot focusing on face, hands, or a specific accessory",
    "different camera angle (side profile, overhead, or low angle looking up)",
]


async def claude_generate_variation_prompts(
    image_path: str,
    anthropic_key: str,
) -> list[str]:
    """Appelle Claude Vision pour générer 3 prompts de variation depuis la photo."""
    import anthropic

    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    # Détecter le media type
    suffix = Path(image_path).suffix.lower()
    media_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    media_type = media_map.get(suffix, "image/jpeg")

    client = anthropic.Anthropic(api_key=anthropic_key)
    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=512,
        system=VARIATION_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Analyze this photo. Generate 3 complementary variation prompts for an Instagram carousel. "
                            "Each should maintain the exact same scene but with: "
                            f"1) {VARIATION_ANGLES[0]}, "
                            f"2) {VARIATION_ANGLES[1]}, "
                            f"3) {VARIATION_ANGLES[2]}. "
                            "Return JSON only: {\"variations\": [\"...\", \"...\", \"...\"]}"
                        ),
                    },
                ],
            }
        ],
    )

    text = message.content[0].text.strip()
    # Extraire le JSON (peut avoir du markdown autour)
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    parsed = json.loads(text)
    variations = parsed.get("variations", [])
    if len(variations) < 3:
        # Fallback si Claude retourne moins de 3
        while len(variations) < 3:
            variations.append("Professional fashion photo, same location and lighting, different elegant pose.")
    return variations[:3]


async def higgsfield_img2img(
    original_path: str,
    prompt: str,
    soul_id: str,
    higgsfield_token: str,
    higgsfield_refresh_token: str = "",
    quality: str = "2k",
    timeout: int = 600,
) -> str:
    """Génère une variation via SoulCinema img2img.

    Commande : higgsfield generate create soul_cinematic
               --soul-id <uuid> --prompt "..." --image <path>
               --aspect_ratio 2:3 --quality 2k --wait

    Retourne l'URL de l'image générée.
    """
    sc_quality = quality if quality in ("1.5k", "2k") else "2k"
    cmd_args = [
        "higgsfield", "generate", "create", "soul_cinematic",
        "--soul-id", soul_id,
        "--prompt", prompt,
        "--image", original_path,
        "--aspect_ratio", "2:3",
        "--quality", sc_quality,
        "--wait",
    ]

    # Initialiser le cache token si pas encore fait
    if not _hf_token_cache:
        _hf_token_cache["access_token"] = higgsfield_token
        _hf_token_cache["refresh_token"] = higgsfield_refresh_token

    async def _run_once() -> str:
        current_token = _hf_token_cache.get("access_token", higgsfield_token)
        current_refresh = _hf_token_cache.get("refresh_token", higgsfield_refresh_token)
        with tempfile.TemporaryDirectory(prefix="hf_var_") as tmp_home:
            creds_dir = Path(tmp_home) / ".config" / "higgsfield"
            creds_dir.mkdir(parents=True)
            (creds_dir / "credentials.json").write_text(
                json.dumps({"access_token": current_token, "refresh_token": current_refresh})
            )

            env = {**os.environ, "HOME": tmp_home}
            proc = await asyncio.create_subprocess_exec(
                *cmd_args,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)

            if proc.returncode != 0:
                raise RuntimeError(f"Higgsfield error: {stderr.decode().strip()[:300]}")

            output = stdout.decode().strip()
            for line in output.split("\n"):
                if line.startswith("http") or "https://" in line:
                    return line.strip()
            try:
                data = json.loads(output)
                url = data.get("url") or data.get("output_url") or data.get("image_url")
                if url:
                    return url
            except Exception:
                pass

            raise RuntimeError(f"Aucune URL trouvée dans la sortie Higgsfield: {output[:200]}")

    # Slot cross-process → max HF_GLOBAL_MAX jobs Higgsfield simultanés TOUS processes confondus.
    # Le slot est toujours libéré dans le bloc finally pour éviter de bloquer inutilement
    # pendant les délais d'attente (concurrent_limit).
    for attempt in range(5):  # 5 tentatives max
        slot = await _acquire_hf_slot()
        try:
            return await _run_once()
        except RuntimeError as e:
            err = str(e)

            # Token expiré → refresh automatique et retry immédiat
            if _is_session_expired(err):
                refresh_tok = _hf_token_cache.get("refresh_token", higgsfield_refresh_token)
                if not refresh_tok:
                    raise RuntimeError(
                        "Token Higgsfield expiré et aucun refresh_token disponible. "
                        "Reconnecte Higgsfield dans les Paramètres."
                    )
                print(json.dumps({
                    "type": "info",
                    "msg": f"Token Higgsfield expiré — refresh automatique en cours..."
                }), flush=True)
                async with _get_token_lock():
                    # Double-check : un autre coroutine a peut-être déjà refreshé
                    if _hf_token_cache.get("access_token") == _hf_token_cache.get("access_token"):
                        new_tok = await _refresh_hf_access_token(refresh_tok)
                        print(json.dumps({
                            "type": "info",
                            "msg": f"Token Higgsfield rafraîchi ✓ — retry..."
                        }), flush=True)
                continue  # finally libère le slot, puis retry en réacquérant

            # Limite de jobs concurrents → libérer le slot AVANT d'attendre
            # (inutile de bloquer un slot pendant 60-180s sans faire de travail)
            if "concurrent" in err.lower() or "upgrade_plan" in err.lower():
                wait = 60 * (attempt + 1)
                _release_hf_slot(slot)
                slot = None  # finally ne double-libère pas
                print(json.dumps({
                    "type": "info",
                    "msg": f"Higgsfield concurrent limit — slot libéré, attente {wait}s avant retry {attempt + 1}/5"
                }), flush=True)
                await asyncio.sleep(wait)
                continue

            raise
        finally:
            if slot is not None:
                _release_hf_slot(slot)
    raise RuntimeError("Higgsfield — max retries atteint (concurrent limit)")


async def download_image(url: str, dest_path: str) -> None:
    """Télécharge une image depuis une URL."""
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        Path(dest_path).write_bytes(resp.content)


# ── Orchestration principale ───────────────────────────────────────────────────

async def run_carousel_variations(
    run_id: str,
    images_dir: str,
    soul_id: str,
    higgsfield_token: str,
    higgsfield_refresh_token: str = "",
    anthropic_key: str = "",
    quality: str = "2k",
    max_concurrent: int = 10,  # Throttle images-level (Claude + Drive) — Higgsfield géré par HF_GLOBAL_MAX (cross-process)
) -> None:
    """
    Pour chaque image uploadée :
      1. Claude Vision → 3 prompts de variation
      2. SoulCinema img2img × 3
      3. Optimizer + upload Drive
    """
    from pipeline.drive_uploader import get_uploader, init_drive_uploader_from_env

    images_dir_path = Path(images_dir)
    images = sorted([
        p for p in images_dir_path.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp") and p.is_file()
    ])

    if not images:
        print(json.dumps({"type": "error", "message": "Aucune image trouvée"}), flush=True)
        return

    total = len(images)
    print(json.dumps({
        "type": "carousel_start",
        "total": total,
        "image_count": total,
    }), flush=True)

    # Init Drive
    init_drive_uploader_from_env()
    uploader = get_uploader()
    if not uploader:
        print(json.dumps({
            "type": "error",
            "message": "Google Drive non configuré (GOOGLE_REFRESH_TOKEN manquant)"
        }), flush=True)
        return

    # Créer le dossier run dans Drive
    try:
        run_folder_id = await uploader._ensure_carousel_run_folder(run_id)
    except Exception as drive_exc:
        print(json.dumps({
            "type": "error",
            "message": f"Google Drive token expired or revoked — go to Settings → Reconnect Drive. ({drive_exc})"
        }), flush=True)
        return

    # Répertoire temp pour les images générées
    tmp_dir = Path(images_dir).parent / f"variations_{run_id}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    sem = asyncio.Semaphore(max_concurrent)

    async def process_one(photo_idx: int, img_path: Path) -> None:
        async with sem:
            carousel_num = photo_idx + 1
            carousel_name = f"carousel_{carousel_num}"
            drive_urls: list[str] = []
            errors: list[str] = []

            try:
                print(json.dumps({
                    "type": "info",
                    "msg": f"Photo {carousel_num}/{total} : analyse + génération variations..."
                }), flush=True)

                # ── 1. Claude Vision → prompts ──
                try:
                    variation_prompts = await claude_generate_variation_prompts(
                        str(img_path), anthropic_key
                    )
                except Exception as e:
                    # Fallback : prompts génériques
                    variation_prompts = [
                        "Professional fashion photo, same elegant setting, slightly different pose showing full figure.",
                        "Close-up fashion shot, same location and lighting, focusing on facial expression and upper body.",
                        "Side profile fashion photo, same atmosphere, graceful lateral pose with the environment visible.",
                    ]
                    print(json.dumps({"type": "info", "msg": f"Claude Vision fallback: {e}"}), flush=True)

                # ── 2. Upload dossier carousel dans Drive ──
                carousel_folder_id = await uploader._ensure_folder(carousel_name, run_folder_id)

                # ── 3. Traiter original (slot 1) ──
                orig_seed = (photo_idx * 10000) & 0x7FFFFFFF
                orig_optimized = optimize_image_bytes(img_path.read_bytes(), orig_seed)
                orig_url = await uploader.upload_bytes(orig_optimized, "1.jpg", carousel_folder_id)
                drive_urls.append(orig_url)

                # ── 4. Générer 3 variations en parallèle (slots 2, 3, 4) ──
                # Le slot cross-process HF_GLOBAL_MAX=6 garantit ≤6 jobs Higgsfield simultanés
                # TOUS processes confondus (Emma + Nina en parallèle = max 6, pas 12).
                async def generate_one_variation(var_idx: int, prompt: str) -> tuple[str | None, str | None]:
                    """Retourne (drive_url, error_msg)."""
                    slot_num = var_idx + 2
                    var_tmp = tmp_dir / f"var_{carousel_num}_{slot_num}.jpg"
                    try:
                        gen_url = await higgsfield_img2img(
                            original_path=str(img_path),
                            prompt=prompt,
                            soul_id=soul_id,
                            higgsfield_token=higgsfield_token,
                            higgsfield_refresh_token=higgsfield_refresh_token,
                            quality=quality,
                        )
                        await download_image(gen_url, str(var_tmp))
                        var_seed = (photo_idx * 10000 + slot_num * 1000) & 0x7FFFFFFF
                        var_optimized = optimize_image_bytes(var_tmp.read_bytes(), var_seed)
                        var_url = await uploader.upload_bytes(var_optimized, f"{slot_num}.jpg", carousel_folder_id)
                        return var_url, None
                    except Exception as e:
                        err = f"Variation {slot_num} échouée: {str(e)[:100]}"
                        print(json.dumps({"type": "info", "msg": err}), flush=True)
                        return None, err
                    finally:
                        try:
                            var_tmp.unlink(missing_ok=True)
                        except Exception:
                            pass

                var_results = await asyncio.gather(*[
                    generate_one_variation(i, p) for i, p in enumerate(variation_prompts)
                ])
                for var_url, var_err in var_results:
                    if var_url:
                        drive_urls.append(var_url)
                    if var_err:
                        errors.append(var_err)

            except Exception as e:
                errors.append(f"Erreur générale photo {carousel_num}: {str(e)[:100]}")

            print(json.dumps({
                "type": "carousel",
                "n": carousel_num,
                "total": total,
                "drive_urls": drive_urls,
                "errors": errors if errors else None,
            }), flush=True)

    tasks = [process_one(idx, img) for idx, img in enumerate(images)]
    await asyncio.gather(*tasks)

    # Nettoyer le dossier temp
    try:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        pass

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": total,
        "finished_at": datetime.utcnow().isoformat(),
    }), flush=True)


# ── Entry point CLI ────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Carousel Variations — img2img SoulCinema")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--images-dir", required=True)
    parser.add_argument("--soul-id", required=True)
    args = parser.parse_args()

    higgsfield_token = os.environ.get("HIGGSFIELD_TOKEN", "")
    higgsfield_refresh = os.environ.get("HIGGSFIELD_REFRESH_TOKEN", "")
    anthropic_key = os.environ.get("ANTHROPIC_KEY", "")
    quality = os.environ.get("VARIATION_QUALITY", "2k")

    if not higgsfield_token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)
    if not anthropic_key:
        print(json.dumps({"type": "error", "message": "ANTHROPIC_KEY manquant"}), flush=True)
        sys.exit(1)

    asyncio.run(run_carousel_variations(
        run_id=args.run_id,
        images_dir=args.images_dir,
        soul_id=args.soul_id,
        higgsfield_token=higgsfield_token,
        higgsfield_refresh_token=higgsfield_refresh,
        anthropic_key=anthropic_key,
        quality=quality,
    ))


if __name__ == "__main__":
    main()
