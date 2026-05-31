"""
Higgsfield CLI wrapper.
Isolation per-user via HOME trick (confirmé fonctionnel).
Fallback chain : soul_cinematic → seedream_v4_5 → nano_banana_2
"""

import asyncio
import json
import os
import re
import tempfile
from pathlib import Path


# ─── Constantes ──────────────────────────────────────────────────────────────

FALLBACK_CHAIN = ["soul_cinematic", "seedream_v4_5", "nano_banana_2"]
MAX_CONCURRENT = 8  # Limite Ultra plan — confirmée via erreur concurrent_jobs_limit
_semaphore: asyncio.Semaphore | None = None


def get_semaphore() -> asyncio.Semaphore:
    """Retourne le sémaphore global (singleton par process)."""
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    return _semaphore


# ─── Build command ────────────────────────────────────────────────────────────

def build_cmd(
    model: str,
    prompt: str,
    soul_id: str,
    element_id: str,
    aspect_ratio: str = "2:3",
    quality: str = "2k"
) -> list:
    """Construit la commande CLI Higgsfield selon le modèle.

    Règle fondamentale :
    - soul_cinematic → --soul-id <id>        (jamais <<<>>>)
    - seedream_v4_5  → <<<element_id>>> dans le prompt (jamais --soul-id)
    - nano_banana_2  → <<<element_id>>> dans le prompt (jamais --soul-id)
    """
    base = [
        "higgsfield", "generate", "create", model,
        "--aspect_ratio", aspect_ratio,
        "--wait"
    ]

    if model == "soul_cinematic":
        # soul_cinematic n'accepte que 1.5k et 2k — on plafonne 4k → 2k
        sc_quality = quality if quality in ("1.5k", "2k") else "2k"
        return base + [
            "--prompt", prompt,
            "--soul-id", soul_id,
            "--quality", sc_quality
        ]
    elif model == "seedream_v4_5":
        return base + [
            "--prompt", f"<<<{element_id}>>> {prompt}",
            "--quality", "high"
        ]
    elif model == "nano_banana_2":
        return base + [
            "--prompt", f"<<<{element_id}>>> {prompt}",
            "--resolution", quality if quality in ("2k", "4k") else "2k"
        ]
    else:
        raise ValueError(f"Modèle inconnu: {model}")


# ─── Isolation per-user via HOME trick ───────────────────────────────────────

async def run_higgsfield_for_user(user_token: str, cmd_args: list, timeout: int = 600, refresh_token: str = "") -> str:
    """Lance une commande Higgsfield CLI avec un HOME isolé pour cet utilisateur.

    Chaque appel crée un répertoire temporaire unique → les credentials ne se mélangent jamais.
    Le répertoire est automatiquement supprimé après l'appel (même en cas d'erreur).
    refresh_token : si fourni, le CLI peut auto-renouveler le token → évite Session expired sur les longs runs.
    """
    with tempfile.TemporaryDirectory(prefix="hf_") as tmp_home:
        # Écrire les credentials de cet user dans son HOME isolé
        creds_dir = Path(tmp_home) / ".config" / "higgsfield"
        creds_dir.mkdir(parents=True)
        (creds_dir / "credentials.json").write_text(
            json.dumps({"access_token": user_token, "refresh_token": refresh_token})
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
            raise Exception(stderr.decode().strip())

        return stdout.decode().strip()


# ─── Device Code Flow (auth) ──────────────────────────────────────────────────

async def start_higgsfield_auth(user_id: str) -> tuple:
    """Lance higgsfield auth login et capture l'URL du device code.

    Returns:
        (proc, tmp_home_path, device_url)
    """
    tmp_home = Path(f"/tmp/hf_auth_{user_id}")
    (tmp_home / ".config" / "higgsfield").mkdir(parents=True, exist_ok=True)

    proc = await asyncio.create_subprocess_exec(
        "higgsfield", "auth", "login",
        env={**os.environ, "HOME": str(tmp_home)},
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    # L'URL apparaît dans stdout dans les premières secondes
    device_url = None
    deadline = asyncio.get_event_loop().time() + 30

    while asyncio.get_event_loop().time() < deadline:
        line_bytes = await asyncio.wait_for(proc.stdout.readline(), timeout=10)
        if not line_bytes:
            break
        line = line_bytes.decode()
        match = re.search(r'https://higgsfield\.ai/device\?code=\S+', line)
        if match:
            device_url = match.group(0)
            break

    if not device_url:
        proc.kill()
        raise RuntimeError("Impossible de capturer l'URL Higgsfield depuis stdout")

    return proc, str(tmp_home), device_url


async def poll_higgsfield_credentials(tmp_home: str, timeout: int = 300) -> dict:
    """Attend que l'utilisateur approuve et récupère le token.

    Returns:
        {"access_token": "hf_...", "refresh_token": "hfr_..."}
    """
    creds_file = Path(tmp_home) / ".config" / "higgsfield" / "credentials.json"
    start = asyncio.get_event_loop().time()

    while asyncio.get_event_loop().time() - start < timeout:
        if creds_file.exists():
            try:
                creds = json.loads(creds_file.read_text())
                if creds.get("access_token"):
                    return creds
            except json.JSONDecodeError:
                pass
        await asyncio.sleep(2)

    raise TimeoutError("L'utilisateur n'a pas approuvé dans le délai imparti")


# ─── List Soul Characters ─────────────────────────────────────────────────────

async def list_soul_characters(user_token: str) -> list:
    """Liste les Soul Characters disponibles pour cet utilisateur.
    Filtre sur status == "completed" uniquement.
    """
    try:
        result = await run_higgsfield_for_user(
            user_token,
            ["higgsfield", "soul-id", "list", "--json"],
            timeout=30
        )
        chars = json.loads(result)
        # Filtrer sur completed uniquement
        return [c for c in chars if c.get("status") == "completed"]
    except Exception:
        return []


# ─── Génération avec fallback ─────────────────────────────────────────────────

async def generate_with_fallback(
    prompt: str,
    soul_id: str,
    element_id: str,
    user_token: str,
    aspect_ratio: str = "2:3",
    quality: str = "2k",
    model_setting: str = "auto",
    shortcode: str = ""
) -> dict:
    """Génère une image avec fallback automatique de modèle.

    model_setting :
    - "auto" → essaie soul_cinematic → seedream_v4_5 → nano_banana_2
    - "soul_cinematic" → soul_cinematic uniquement
    - "seedream_v4_5" → seedream_v4_5 uniquement
    - "nano_banana_2" → nano_banana_2 uniquement

    Returns:
        {"url": "...", "model": "...", "fallback": bool}
        ou {"url": None, "model": None, "error": "ALL_MODELS_FAILED"}
    """
    sem = get_semaphore()

    if model_setting == "auto":
        chain = FALLBACK_CHAIN
    else:
        chain = [model_setting]

    primary_model = chain[0]

    for model in chain:
        async with sem:
            try:
                cmd = build_cmd(model, prompt, soul_id, element_id, aspect_ratio, quality)
                result_url = await run_higgsfield_for_user(user_token, cmd, timeout=600)

                if result_url:
                    return {
                        "url": result_url,
                        "model": model,
                        "fallback": model != primary_model,
                        "fallback_reason": None
                    }

            except asyncio.TimeoutError:
                print(json.dumps({
                    "type": "generation_retry",
                    "shortcode": shortcode,
                    "model": model,
                    "reason": "timeout"
                }), flush=True)
                continue

            except Exception as e:
                err = str(e)

                if "concurrent_jobs_limit" in err:
                    # Retry après attente
                    await asyncio.sleep(15)
                    # Retry le même modèle (on le remet dans la queue)
                    try:
                        result_url = await run_higgsfield_for_user(user_token, cmd, timeout=600)
                        if result_url:
                            return {
                                "url": result_url,
                                "model": model,
                                "fallback": model != primary_model,
                                "fallback_reason": None
                            }
                    except Exception:
                        pass

                fallback_reason = None
                if "content_policy" in err.lower() or "safety" in err.lower():
                    fallback_reason = "content_policy"
                elif "timeout" in err.lower():
                    fallback_reason = "timeout"
                else:
                    fallback_reason = "error"

                print(json.dumps({
                    "type": "generation_retry",
                    "shortcode": shortcode,
                    "model": model,
                    "reason": fallback_reason,
                    "error": err[:200]
                }), flush=True)
                continue

    return {"url": None, "model": None, "fallback": False, "error": "ALL_MODELS_FAILED"}
