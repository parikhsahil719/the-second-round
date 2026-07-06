"""Polite cached HTTP: every raw response lands on disk once, rate-limited per host."""

import time
from pathlib import Path
from urllib.parse import urlparse

import requests

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) second-round-draft-model (personal research)"}

# B-Ref asks for <=20 req/min; 3.5s keeps us safely under everywhere
MIN_INTERVAL = 3.5
_last_hit: dict[str, float] = {}


def get(url: str, cache_name: str) -> str:
    """Cached GET. cache_name is a path relative to data/raw/, e.g. 'bref/draft_2016.html'."""
    cache = RAW / cache_name
    if cache.exists():
        return cache.read_text(encoding="utf-8")

    host = urlparse(url).netloc
    wait = MIN_INTERVAL - (time.monotonic() - _last_hit.get(host, 0.0))
    if wait > 0:
        time.sleep(wait)
    resp = requests.get(url, headers=UA, timeout=30)
    _last_hit[host] = time.monotonic()
    resp.raise_for_status()
    resp.encoding = "utf-8"  # B-Ref omits charset; requests guesses latin-1 and mangles names

    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(resp.text, encoding="utf-8")
    return resp.text


def uncomment(html: str) -> str:
    """B-Ref hides many tables inside HTML comments; strip the markers so parsers see them."""
    return html.replace("<!--", "").replace("-->", "")
