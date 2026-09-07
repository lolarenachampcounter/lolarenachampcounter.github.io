"""
Regenerates data/champions.json from Riot's Data Dragon API.

Run manually whenever a new LoL patch adds/reworks champions:

    python scripts/update_champions.py

Requires only the standard library (urllib + json).
"""
import json
import urllib.request
from datetime import date, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "champions.json"


def fetch_json(url: str):
    with urllib.request.urlopen(url) as res:
        return json.load(res)


def main() -> None:
    versions = fetch_json("https://ddragon.leagueoflegends.com/api/versions.json")
    version = versions[0]

    en = fetch_json(
        f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"
    )["data"]
    es = fetch_json(
        f"https://ddragon.leagueoflegends.com/cdn/{version}/data/es_ES/champion.json"
    )["data"]

    champions = []
    for champ_id, c in en.items():
        es_c = es.get(champ_id, {})
        champions.append(
            {
                "id": c["id"],
                "name": {"en": c["name"], "es": es_c.get("name", c["name"])},
                "image": f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{c['image']['full']}",
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


if __name__ == "__main__":
    main()
