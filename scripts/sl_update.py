"""Daily Summer League refresh: build, commit only deploy artifacts, push.

Register once (runs 08:00 daily through the morning after Vegas ends; the log
lives in gitignored data/raw/sl/):

  schtasks /Create /TN "SecondRoundSL" /SC DAILY /ST 08:00 /ED 07/20/2026 /TR ^
    "cmd /c \"\"C:\\Users\\parik\\Documents\\NBA Draft Intelligence Model\\.venv\\Scripts\\python.exe\" \"C:\\Users\\parik\\Documents\\NBA Draft Intelligence Model\\scripts\\sl_update.py\" >> \"C:\\Users\\parik\\Documents\\NBA Draft Intelligence Model\\data\\raw\\sl\\update.log\" 2>&1\""

Remove after Summer League: schtasks /Delete /TN "SecondRoundSL" /F
"""

from __future__ import annotations

import subprocess
import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from model.summer import build  # noqa: E402

SL_END = date(2026, 7, 19)
ARTIFACTS = (Path("data/processed/summer_league.parquet"),
             Path("data/processed/sl_posterior.parquet"))


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args], check=check, text=True,
        capture_output=True,
    )


def main() -> int:
    if date.today() > SL_END:
        print('Summer League is over. Remove the task: schtasks /Delete /TN "SecondRoundSL" /F')
        return 0

    # Rebase before producing today's deploy artifacts, never after staging them.
    # --autostash so local WIP never kills the unattended run.
    pull = git("pull", "--rebase", "--autostash", check=False)
    if pull.returncode:
        print(f"git pull --rebase failed: {pull.stderr.strip()}")
        return pull.returncode

    before = {p: (ROOT / p).read_bytes() if (ROOT / p).exists() else None for p in ARTIFACTS}
    box, post = build()
    if post.empty:
        print("No board players matched in Summer League yet; nothing to publish.")
        return 0
    if all(before[p] == (ROOT / p).read_bytes() for p in ARTIFACTS):
        print("No new Summer League games; deploy artifacts unchanged.")
        return 0

    paths = [str(p).replace("\\", "/") for p in ARTIFACTS]
    top = post.loc[post.ev_delta.abs().idxmax()]
    as_of = str(post.as_of.max())
    games = int(pd.to_numeric(box.gp).sum())
    message = (f"SL update through {as_of}: {games} player-games, "
               f"top mover {top.player_name} ({top.ev_delta:+.1f} EV)")
    # Pathspec commit: pre-staged WIP must never ride along with the deploy artifacts.
    git("add", *paths)
    git("commit", "-m", message, "--", *paths)
    pushed = git("push", check=False)
    if pushed.returncode:
        print("Push failed; the commit is local and tomorrow's run can retry.")
        print(pushed.stderr.strip())
        return pushed.returncode
    print(message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
