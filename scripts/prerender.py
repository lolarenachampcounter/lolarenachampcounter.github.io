"""
Injects the champion grid into the static HTML at build time.

The grid used to be built entirely by app.js, which meant the HTML served to
crawlers contained no champion at all. Crawlers that don't execute JavaScript
(Bing, DuckDuckGo, LLM crawlers, image crawlers) saw an empty page, and the
late injection of ~170 cards pushed the rest of the page down (CLS).

This script rewrites the block between the CHAMPIONS markers in every
index.html from data/champions.json. It is idempotent: run it as many times as
you like. app.js then hydrates the existing markup instead of rebuilding it.

    python scripts/prerender.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "champions.json"

# Cards above the fold are worth loading eagerly: one of them is the LCP
# candidate, and lazy-loading it only delays the largest paint.
EAGER_CARDS = 12

PAGES = {
    ROOT / "index.html": "en",
    ROOT / "es" / "index.html": "es",
}

START = "<!-- CHAMPIONS:START -->"
END = "<!-- CHAMPIONS:END -->"


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# Texto del enlace a la guía de build, en el mismo idioma que la página.
BUILD_LINK_LABEL = {
    "en": "Arena build guide for {name} (opens metasrc.com in a new tab)",
    "es": "Guía de build de Arena para {name} (abre metasrc.com en una pestaña nueva)",
}


def card(champ: dict, lang: str, eager: bool) -> str:
    name = escape(champ["name"].get(lang) or champ["name"]["en"])
    image = escape(champ["image"])
    champ_id = escape(champ["id"])
    build_url = escape(champ["buildUrl"])
    build_label = escape(BUILD_LINK_LABEL[lang].format(name=champ["name"].get(lang) or champ["name"]["en"]))
    loading = 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy"'
    # El enlace de build es HERMANO del <button>, no hijo: un <a> dentro de un
    # <button> es contenido interactivo anidado, inválido en HTML.
    return (
        f'      <div class="champion-cell" data-champion-id="{champ_id}">'
        f'<button type="button" class="champion" aria-pressed="false">'
        f'<img src="{image}" alt="{name}" width="64" height="64" '
        f'decoding="async" {loading} />'
        f'<span class="champion-name">{name}</span></button>'
        f'<a class="build-link" href="{build_url}" target="_blank" '
        f'rel="noopener noreferrer" aria-label="{build_label}" '
        f'title="{build_label}">↗</a></div>'
    )


def read(path: Path) -> str:
    """Read without newline translation, so CRLF files stay CRLF.

    Keeps the build byte-identical on Windows and on the Linux CI runner.
    (Path.read_text only accepts `newline` from Python 3.13.)
    """
    with path.open(encoding="utf-8", newline="") as fh:
        return fh.read()


def write(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def bump_dates(text: str, pattern: str, generated_at: str) -> str:
    """Move any date in `pattern` forward to `generated_at`, never backward.

    Editorial changes bump these dates by hand; a new champion snapshot bumps
    them here. Taking the later of the two keeps both honest.
    """

    def newer(match: re.Match) -> str:
        return match.group(0).replace(match.group(1), max(match.group(1), generated_at))

    return re.sub(pattern, newer, text)


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    champions = data["champions"]
    generated_at = data["generatedAt"]

    for path, lang in PAGES.items():
        # newline="" desactiva la traducción de saltos de línea: así el fichero
        # conserva sus CRLF y el build da el mismo resultado en Windows y en CI.
        html = read(path)
        if START not in html or END not in html:
            raise SystemExit(f"{path}: missing CHAMPIONS markers")

        eol = "\r\n" if "\r\n" in html else "\n"
        cards = eol.join(
            card(c, lang, eager=i < EAGER_CARDS) for i, c in enumerate(champions)
        )
        block = f"{START}{eol}{cards}{eol}      {END}"
        html = re.sub(
            re.escape(START) + r".*?" + re.escape(END),
            lambda _: block,
            html,
            flags=re.DOTALL,
        )
        html = bump_dates(
            html, r'"dateModified":\s*"(\d{4}-\d{2}-\d{2})"', generated_at
        )
        write(path, html)
        print(f"Prerendered {len(champions)} champions into {path} ({lang})")

    # Sólo las dos home dependen del snapshot de campeones; las páginas de
    # privacidad conservan su propia fecha.
    sitemap_path = ROOT / "sitemap.xml"
    sitemap = read(sitemap_path)
    homes = re.compile(
        r"(<loc>https://lolarenachampcounter\.github\.io/(?:es/)?</loc>\s*"
        r"<lastmod>)(\d{4}-\d{2}-\d{2})(</lastmod>)"
    )
    sitemap = homes.sub(
        lambda m: m.group(1) + max(m.group(2), generated_at) + m.group(3), sitemap
    )
    write(sitemap_path, sitemap)
    print(f"Synced sitemap lastmod against snapshot date {generated_at}")


if __name__ == "__main__":
    main()
