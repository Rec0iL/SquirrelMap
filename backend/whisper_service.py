import os
import sys
import uuid
import time
import asyncio
from typing import Optional, Dict, Any

# Configure audio storage in user config dir
DATA_DIR = os.environ.get("SQUIRRELMAP_DATA_DIR", os.path.expanduser("~/.config/squirrelmap"))
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

_model_instance = None
_model_name_loaded = None

def get_audio_dir() -> str:
    return AUDIO_DIR

def is_whisper_available() -> Dict[str, Any]:
    try:
        import whisper
        import torch
        cuda_avail = torch.cuda.is_available()
        device_name = torch.cuda.get_device_name(0) if cuda_avail else "CPU"
        return {
            "available": True,
            "cuda": cuda_avail,
            "device": device_name,
            "default_model": "base"
        }
    except Exception as e:
        return {
            "available": False,
            "error": str(e)
        }

def load_whisper_model(model_name: str = "base"):
    global _model_instance, _model_name_loaded
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

async def transcribe_audio_file(
    file_bytes: bytes,
    original_filename: Optional[str] = None,
    model_name: str = "base"
) -> Dict[str, Any]:
    """Transcribes audio using Whisper asynchronously."""
    status = is_whisper_available()
    if not status.get("available"):
        return {
            "success": False,
            "error": f"Whisper is not available: {status.get('error', 'unknown')}"
        }

    filename, file_path = save_uploaded_audio(file_bytes, original_filename)
    audio_url = f"/api/whisper/audio/{filename}"

    loop = asyncio.get_event_loop()

    def _sync_transcribe():
        import torch
        model = load_whisper_model(model_name)
        use_fp16 = torch.cuda.is_available()
        print(f"[WhisperService] Starting transcription for {filename} ({os.path.getsize(file_path)} bytes)...", flush=True)
        t0 = time.time()
        result = model.transcribe(file_path, fp16=use_fp16)
        elapsed = time.time() - t0
        text = (result.get("text") or "").strip()
        lang = result.get("language", "en")
        print(f"[WhisperService] Transcribed in {elapsed:.2f}s (lang: {lang}, {len(text)} chars)", flush=True)
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
            "filename": filename
        }
    except Exception as e:
        print(f"[WhisperService] Transcription failed: {str(e)}", flush=True)
        return {
            "success": False,
            "error": f"Whisper transcription failed: {str(e)}",
            "audio_url": audio_url,
            "filename": filename
        }
