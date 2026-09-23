"""
Regenerates data/champions.json from Riot's Data Dragon API, and downloads
each champion portrait locally instead of linking to ddragon at runtime.

Self-hosting the portraits removes 173 requests to a third-party domain from
the page's critical path (including the likely LCP candidate) and means the
grid still renders if ddragon is slow or unreachable.

Run manually whenever a new LoL patch adds/reworks champions:

    python scripts/update_champions.py

Then run scripts/prerender.py to bake the new image paths into the HTML.
Requires only the standard library (urllib + json).
"""
import json
import urllib.request
from datetime import date, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "champions.json"
IMAGES_DIR = ROOT / "assets" / "champions"


def fetch_json(url: str):
    with urllib.request.urlopen(url) as res:
        return json.load(res)


def download_image(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as res:
        dest.write_bytes(res.read())


def main() -> None:
    versions = fetch_json("https://ddragon.leagueoflegends.com/api/versions.json")
    version = versions[0]

    en = fetch_json(
        f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"
    )["data"]
    es = fetch_json(
        f"https://ddragon.leagueoflegends.com/cdn/{version}/data/es_ES/champion.json"
    )["data"]

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    champions = []
    for champ_id, c in en.items():
        es_c = es.get(champ_id, {})
        image_name = c["image"]["full"]
        dest = IMAGES_DIR / image_name
        # Skip champions whose portrait hasn't changed since the last run —
        # only new/reworked champions trigger a download.
        if not dest.exists() or dest.stat().st_size == 0:
            download_image(
                f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{image_name}",
                dest,
            )
        champions.append(
            {
                "id": c["id"],
                "name": {"en": c["name"], "es": es_c.get("name", c["name"])},
                "image": f"/assets/champions/{image_name}",
            }
        )
    champions.sort(key=lambda c: c["id"])

    out = {
        "version": version,
        "generatedAt": date.today().isoformat(),
        "champions": champions,
    }

    OUTPUT.write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(champions)} champions (patch {version}) to {OUTPUT}")
    print(f"Portraits stored in {IMAGES_DIR}")


if __name__ == "__main__":
    main()
