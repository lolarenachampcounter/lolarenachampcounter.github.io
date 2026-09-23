"""
Regenerates data/champions.json from Riot's Data Dragon API, downloads each
champion portrait locally instead of linking to ddragon at runtime, and
attaches an Arena build guide link (metasrc.com) per champion.

Self-hosting the portraits removes 173 requests to a third-party domain from
the page's critical path (including the likely LCP candidate) and means the
grid still renders if ddragon is slow or unreachable.

Run manually whenever a new LoL patch adds/reworks champions:

    python scripts/update_champions.py

Then run scripts/prerender.py to bake the new image paths/build links into
the HTML. Requires only the standard library (urllib + json).
"""
import json
import re
import urllib.error
import urllib.request
from datetime import date, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "champions.json"
IMAGES_DIR = ROOT / "assets" / "champions"

# metasrc's champion slugs are mostly-but-not-perfectly derived from the
# display name (e.g. "Wukong" -> "wukong", "Miss Fortune" -> "miss-fortune",
# apostrophes dropped: "Kai'Sa" -> "kaisa") — except short forms like
# "Jarvan IV" -> "jarvan". Add overrides here for any champion this guesses
# wrong; verify new champions manually against
# https://www.metasrc.com/lol/arena/sitemap.xml before trusting the guess.
METASRC_SLUG_OVERRIDES = {
    "JarvanIV": "jarvan",
}


def fetch_json(url: str):
    with urllib.request.urlopen(url) as res:
        return json.load(res)


def download_image(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as res:
        dest.write_bytes(res.read())


def guess_metasrc_slug(champ_id: str, name_en: str) -> str:
    if champ_id in METASRC_SLUG_OVERRIDES:
        return METASRC_SLUG_OVERRIDES[champ_id]
    slug = re.sub(r"[^a-z0-9]+", "-", name_en.lower()).strip("-")
    return slug


def load_previous_build_urls() -> dict:
    if not OUTPUT.exists():
        return {}
    previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
    return {c["id"]: c["buildUrl"] for c in previous["champions"] if c.get("buildUrl")}


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
    previous_build_urls = load_previous_build_urls()

    champions = []
    new_champion_ids = []
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

        build_url = previous_build_urls.get(c["id"])
        if not build_url:
            new_champion_ids.append(c["id"])
            slug = guess_metasrc_slug(c["id"], c["name"])
            build_url = f"https://www.metasrc.com/lol/arena/champions/{slug}/build"

        champions.append(
            {
                "id": c["id"],
                "name": {"en": c["name"], "es": es_c.get("name", c["name"])},
                "image": f"/assets/champions/{image_name}",
                "buildUrl": build_url,
                "roles": c["tags"],
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
    if new_champion_ids:
        print(
            "New champions with a GUESSED metasrc build URL — verify against "
            "https://www.metasrc.com/lol/arena/sitemap.xml and add an override "
            "in METASRC_SLUG_OVERRIDES above if wrong:"
        )
        for cid in new_champion_ids:
            print(f"  - {cid}")


if __name__ == "__main__":
    main()
