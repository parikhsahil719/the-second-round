"""Free-text scout note -> structured rubric scores, via Claude Haiku.

The LLM only ever translates text into the fixed rubric (trait, score -2..+2,
confidence, evidence quote); all probability math stays in notes.py where it is
deterministic and capped. Falls back to a keyword mock when no ANTHROPIC_API_KEY
is set, so the whole system runs without a key (demo mode).

CLI test: python model/extract.py "his jumper is broken but the motor never stops"
"""

import json
import os
import re
import sys
from pathlib import Path

from notes import RUBRIC

ROOT = Path(__file__).resolve().parent.parent


def _coerce(traits) -> list[dict]:
    """The model occasionally returns the array as a (sometimes malformed) JSON string.
    Parse whole; salvage object-by-object on failure; validate every entry."""
    if isinstance(traits, str):
        try:
            traits = json.loads(traits)
        except json.JSONDecodeError:
            salvaged = []
            for m in re.finditer(r"\{[^{}]*\}", traits):
                try:
                    salvaged.append(json.loads(m.group()))
                except json.JSONDecodeError:
                    pass
            traits = salvaged
    out = []
    for t in traits if isinstance(traits, list) else []:
        try:
            if t["trait"] in RUBRIC:
                out.append({"trait": t["trait"], "score": int(t["score"]),
                            "confidence": float(t["confidence"]),
                            "evidence": str(t.get("evidence", ""))})
        except (KeyError, TypeError, ValueError):
            continue
    return out


def _load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


EXTRACT_TOOL = {
    "name": "record_rubric",
    "description": "Record the scouting rubric extracted from the note.",
    "input_schema": {
        "type": "object",
        "properties": {
            "traits": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "trait": {"type": "string", "enum": list(RUBRIC)},
                        "score": {"type": "integer", "minimum": -2, "maximum": 2},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "evidence": {"type": "string"},
                    },
                    "required": ["trait", "score", "confidence", "evidence"],
                },
            }
        },
        "required": ["traits"],
    },
}

SYSTEM = """You translate NBA scouting notes into a fixed rubric. For each trait the note
gives real evidence about, emit a score: -2 (major weakness) to +2 (elite strength),
relative to expectations for a draft prospect, and a confidence 0-1 reflecting how
directly and strongly the note supports it (hedged or secondhand -> low confidence).
Only emit traits the note actually addresses — never infer unmentioned traits.
Quote the exact supporting phrase as evidence."""


def extract_llm(note: str) -> list[dict]:
    import anthropic
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        system=SYSTEM,
        tools=[EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "record_rubric"},
        messages=[{"role": "user", "content": f"Scouting note:\n{note}"}],
    )
    block = next(b for b in resp.content if b.type == "tool_use")
    return _coerce(block.input.get("traits", []))


# ponytail: crude keyword mock — exists so the demo runs keyless; the LLM path is the product
MOCK_KEYWORDS = {
    "shooting": ["shot", "shooter", "jumper", "range", "stroke", "three"],
    "handle_creation": ["handle", "dribble", "creation", "creates", "self-create"],
    "passing_feel": ["passing", "passer", "playmak", "vision", "assist"],
    "finishing": ["finish", "rim", "layup", "dunk"],
    "perimeter_defense": ["perimeter d", "on-ball", "guards the", "point-of-attack", "defender"],
    "rim_protection": ["rim protect", "shot block", "block", "vertical"],
    "frame_length": ["frame", "wingspan", "length", "body"],
    "athleticism": ["athletic", "burst", "explosive", "bounce", "speed"],
    "motor_compete": ["motor", "compete", "effort", "hustle"],
    "basketball_iq": ["iq", "feel", "reads", "decision", "instinct"],
    "role_translatability": ["role", "translat", "fit", "nba-ready"],
    "age_relative_polish": ["young", "polish", "mature", "raw"],
}
NEGATIVE_HINTS = ["struggle", "poor", "weak", "concern", "broken", "can't", "cannot",
                  "lacks", "questionable", "bad", "worri", "limited", "stiff", "slow"]


def extract_mock(note: str) -> list[dict]:
    low = note.lower()
    out = []
    for trait, kws in MOCK_KEYWORDS.items():
        for kw in kws:
            i = low.find(kw)
            if i < 0:
                continue
            window = low[max(0, i - 60):i + 60]
            neg = any(h in window for h in NEGATIVE_HINTS)
            out.append({"trait": trait, "score": -1 if neg else 1,
                        "confidence": 0.4, "evidence": kw})
            break
    return out


def extract(note: str) -> tuple[list[dict], str]:
    _load_env()
    if os.environ.get("ANTHROPIC_API_KEY"):
        return extract_llm(note), "llm"
    return extract_mock(note), "mock"


if __name__ == "__main__":
    note = " ".join(sys.argv[1:]) or "Elite shooter with deep range, but a stiff defender who struggles on the perimeter."
    traits, mode = extract(note)
    print(f"mode: {mode}")
    print(json.dumps(traits, indent=2))
