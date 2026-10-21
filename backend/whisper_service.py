import os
import sys
import glob
import uuid
import time
import json
import shutil
import asyncio
import tempfile
import subprocess
from typing import Optional, Dict, Any

# Configure audio storage in user config dir
DATA_DIR = os.environ.get("SQUIRRELMAP_DATA_DIR", os.path.expanduser("~/.config/squirrelmap"))
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

_model_instance = None
_model_name_loaded = None

def get_audio_dir() -> str:
    return AUDIO_DIR

def _discover_and_add_site_packages():
    """
    If running inside an isolated PyInstaller binary or non-default environment,
    dynamically discover host system site-packages containing whisper and torch.
    """
    candidate_paths = [
        # PlatformIO / custom Python environments
        os.path.expanduser("~/.platformio_py310/lib64/python3.10/site-packages"),
        os.path.expanduser("~/.platformio_py310/lib/python3.10/site-packages"),
        # User local site-packages
        *glob.glob(os.path.expanduser("~/.local/lib/python*/site-packages")),
        *glob.glob(os.path.expanduser("~/.local/lib64/python*/site-packages")),
        # Conda / Anaconda
        *glob.glob(os.path.expanduser("~/anaconda3/lib/python*/site-packages")),
        *glob.glob(os.path.expanduser("~/miniconda3/lib/python*/site-packages")),
        # System site-packages
        *glob.glob("/usr/local/lib/python*/site-packages"),
        *glob.glob("/usr/local/lib64/python*/site-packages"),
        *glob.glob("/usr/lib64/python*/site-packages"),
        *glob.glob("/usr/lib/python*/site-packages"),
        # Windows locations
        *glob.glob(os.path.expandvars("%APPDATA%\\Python\\Python*\\site-packages")),
        *glob.glob(os.path.expandvars("%LOCALAPPDATA%\\Programs\\Python\\Python*\\Lib\\site-packages")),
    ]
    for p in candidate_paths:
        if p and os.path.isdir(p) and p not in sys.path:
            if os.path.isdir(os.path.join(p, "whisper")) or os.path.exists(os.path.join(p, "whisper.py")):
                sys.path.append(p)

def _find_whisper_cli() -> Optional[str]:
    """Finds the whisper executable across PATH and known user install locations."""
    # 1. Standard PATH
    found = shutil.which("whisper")
    if found:
        return found

    # 2. Known directories
    candidates = [
        os.path.expanduser("~/.local/bin/whisper"),
        os.path.expanduser("~/.platformio_py310/bin/whisper"),
        "/usr/local/bin/whisper",
        "/usr/bin/whisper",
        "/bin/whisper",
        os.path.expanduser("~/anaconda3/bin/whisper"),
        os.path.expanduser("~/miniconda3/bin/whisper"),
        # Windows
        os.path.expandvars("%APPDATA%\\Python\\Python310\\Scripts\\whisper.exe"),
        os.path.expandvars("%LOCALAPPDATA%\\Programs\\Python\\Python310\\Scripts\\whisper.exe"),
        shutil.which("whisper.exe")
    ]
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None

def is_whisper_available() -> Dict[str, Any]:
    """
    Checks if Whisper is available via in-process Python module or CLI executable.
    Returns status dict with engine details.
    """
    _discover_and_add_site_packages()

    # 1. Try python module import
    try:
        import whisper
        import torch
        cuda_avail = torch.cuda.is_available()
        device_name = torch.cuda.get_device_name(0) if cuda_avail else "CPU"
        return {
            "available": True,
            "mode": "module",
            "cuda": cuda_avail,
            "device": device_name,
            "default_model": "base"
        }
    except Exception as mod_err:
        # 2. Fall back to CLI executable
        cli_path = _find_whisper_cli()
        if cli_path:
            has_cuda = bool(shutil.which("nvidia-smi"))
            return {
                "available": True,
                "mode": "cli",
                "cli_path": cli_path,
                "cuda": has_cuda,
                "device": "CUDA (CLI)" if has_cuda else "CPU (CLI)",
                "default_model": "base"
            }
        return {
            "available": False,
            "error": f"No module named whisper and whisper CLI not found in PATH (~/.local/bin, ~/.platformio_py310/bin). (Import failure: {mod_err})"
        }

def load_whisper_model(model_name: str = "base"):
    global _model_instance, _model_name_loaded
    _discover_and_add_site_packages()
    import whisper
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if _model_instance is None or _model_name_loaded != model_name:
        print(f"[WhisperService] Loading model '{model_name}' onto {device}...", flush=True)
        t0 = time.time()
        _model_instance = whisper.load_model(model_name, device=device)
        _model_name_loaded = model_name
        print(f"[WhisperService] Model '{model_name}' loaded in {time.time() - t0:.2f}s", flush=True)
    return _model_instance

def save_uploaded_audio(file_bytes: bytes, original_filename: Optional[str] = None) -> tuple[str, str]:
    """Saves raw audio bytes to disk, returning (relative_filename, absolute_path)."""
    ext = ".webm"
    if original_filename:
        _, file_ext = os.path.splitext(original_filename)
        if file_ext.lower() in [".webm", ".ogg", ".wav", ".mp3", ".m4a", ".aac", ".flac"]:
            ext = file_ext.lower()

    unique_id = uuid.uuid4().hex[:8]
    filename = f"voice_{int(time.time())}_{unique_id}{ext}"
    dest_path = os.path.join(AUDIO_DIR, filename)

    with open(dest_path, "wb") as f:
        f.write(file_bytes)

    return filename, dest_path

async def _transcribe_via_cli(cli_path: str, file_path: str, model_name: str = "base") -> Dict[str, Any]:
    """Transcribes audio file using external whisper CLI subprocess."""
    with tempfile.TemporaryDirectory() as tmpdir:
        has_cuda = False
        try:
            import torch
            has_cuda = torch.cuda.is_available()
        except Exception:
            has_cuda = bool(shutil.which("nvidia-smi"))

        device_arg = "cuda" if has_cuda else "cpu"
        cmd = [
            cli_path,
            file_path,
            "--model", model_name,
            "--output_dir", tmpdir,
            "--output_format", "json",
            "--device", device_arg
        ]
        print(f"[WhisperService] Invoking CLI fallback: {' '.join(cmd)}", flush=True)
        t0 = time.time()
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        elapsed = time.time() - t0

        if proc.returncode != 0:
            err_msg = stderr.decode("utf-8", errors="replace").strip()
            print(f"[WhisperService] CLI failed (exit code {proc.returncode}): {err_msg}", flush=True)
            raise RuntimeError(f"Whisper CLI execution error: {err_msg}")

        base_name = os.path.splitext(os.path.basename(file_path))[0]
        json_file = os.path.join(tmpdir, f"{base_name}.json")
        if not os.path.exists(json_file):
            json_candidates = glob.glob(os.path.join(tmpdir, "*.json"))
            if json_candidates:
                json_file = json_candidates[0]
            else:
                raise RuntimeError(f"Whisper CLI JSON output file not found in {tmpdir}")

        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        text = (data.get("text") or "").strip()
        lang = data.get("language", "en")
        print(f"[WhisperService] CLI transcribed in {elapsed:.2f}s (lang: {lang}, {len(text)} chars)", flush=True)
        return {
            "text": text,
            "language": lang,
            "elapsed_seconds": round(elapsed, 2)
        }

async def transcribe_audio_file(
    file_bytes: bytes,
    original_filename: Optional[str] = None,
    model_name: str = "base"
) -> Dict[str, Any]:
    """Transcribes audio using Whisper (in-process module or CLI fallback) asynchronously."""
    # Always save audio first so we preserve user recording and return audio_url even on error
    filename, file_path = save_uploaded_audio(file_bytes, original_filename)
    audio_url = f"/api/whisper/audio/{filename}"

    status = is_whisper_available()
    if not status.get("available"):
        return {
            "success": False,
            "error": f"Whisper is not available: {status.get('error', 'unknown')}",
            "audio_url": audio_url,
            "filename": filename
        }

    mode = status.get("mode", "module")
    cli_path = status.get("cli_path") or _find_whisper_cli()

    # Try in-process module first if available
    if mode == "module":
        loop = asyncio.get_event_loop()
        def _sync_transcribe():
            import torch
            model = load_whisper_model(model_name)
            use_fp16 = torch.cuda.is_available()
            print(f"[WhisperService] Starting module transcription for {filename} ({os.path.getsize(file_path)} bytes)...", flush=True)
            t0 = time.time()
            result = model.transcribe(file_path, fp16=use_fp16)
            elapsed = time.time() - t0
            text = (result.get("text") or "").strip()
            lang = result.get("language", "en")
            print(f"[WhisperService] Module transcribed in {elapsed:.2f}s (lang: {lang}, {len(text)} chars)", flush=True)
            return {
                "text": text,
                "language": lang,
                "elapsed_seconds": round(elapsed, 2)
            }

        try:
            res = await loop.run_in_executor(None, _sync_transcribe)
            return {
                "success": True,
                "text": res["text"],
                "language": res["language"],
                "elapsed_seconds": res["elapsed_seconds"],
                "audio_url": audio_url,
                "filename": filename,
                "mode": "module"
            }
        except Exception as mod_err:
            print(f"[WhisperService] In-process transcription failed: {mod_err}. Attempting CLI fallback...", flush=True)
            if not cli_path:
                return {
                    "success": False,
                    "error": f"Whisper transcription failed: {str(mod_err)}",
                    "audio_url": audio_url,
                    "filename": filename
                }

    # CLI fallback
    if cli_path:
        try:
            res = await _transcribe_via_cli(cli_path, file_path, model_name)
            return {
                "success": True,
                "text": res["text"],
                "language": res["language"],
                "elapsed_seconds": res["elapsed_seconds"],
                "audio_url": audio_url,
                "filename": filename,
                "mode": "cli"
            }
        except Exception as cli_err:
            return {
                "success": False,
                "error": f"Whisper CLI transcription failed: {str(cli_err)}",
                "audio_url": audio_url,
                "filename": filename
            }

    return {
        "success": False,
        "error": "Whisper is not available: No valid transcription engine found",
        "audio_url": audio_url,
        "filename": filename
    }
