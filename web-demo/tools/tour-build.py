"""Builds a self-contained HTML tour from captured screenshots: python3 -I tour-build.py manifest.json out.html"""
import base64, html, io, json, sys
from PIL import Image

SP = "/tmp/claude-0/-home-user-my-first-repo/c99faef3-0027-5e1f-991e-d94ee4aee220/scratchpad"
manifest = json.load(open(sys.argv[1]))
out = sys.argv[2]

def img_data(shot_id, max_w):
    im = Image.open(f"{SP}/tour/{shot_id}.png").convert("RGB")
    # Very tall phone captures: keep the first ~6 screens.
    if im.height > im.width * 5.6:
        im = im.crop((0, 0, im.width, int(im.width * 5.6)))
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
    return base64.b64encode(buf.getvalue()).decode(), im.width, im.height

crest = base64.b64encode(open("/home/user/my-first-repo/src/assets/brand/crest.png", "rb").read()).decode()

sections_html = []
toc = []
for s in manifest["sections"]:
    toc.append(f'<a href="#{s["id"]}">{html.escape(s["title"])}</a>')
    figs = []
    for shot in s["shots"]:
        mobile = shot.get("mobile", False)
        data, w, h = img_data(shot["id"], 430 if mobile else 1440)
        roles = "".join(f'<span class="role">{html.escape(r)}</span>' for r in shot.get("roles", []))
        figs.append(
            f'<figure class="{"mobile" if mobile else "desktop"}">'
            f'<img loading="lazy" width="{w}" height="{h}" alt="{html.escape(shot["caption"])}" src="data:image/jpeg;base64,{data}">'
            f'<figcaption><strong>{html.escape(shot["title"])}</strong>{roles}<span>{html.escape(shot["caption"])}</span></figcaption></figure>'
        )
    points = "".join(f"<li>{html.escape(p)}</li>" for p in s.get("points", []))
    sections_html.append(
        f'<section id="{s["id"]}"><header><p class="eyebrow">{html.escape(s.get("eyebrow", ""))}</p><h2>{html.escape(s["title"])}</h2>'
        f'<p class="lede">{html.escape(s["lede"])}</p>{f"<ul class=points>{points}</ul>" if points else ""}</header>'
        f'<div class="figs{" figs-mobile" if all(x.get("mobile") for x in s["shots"]) else ""}">{"".join(figs)}</div></section>'
    )

page = f"""<title>Integral Workspace Tour</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap">
<style>
/* Layout: navy crest hero, sticky section index, then one screenshot gallery per module. */
:root {{ --bg:#f5f4ef; --fg:#0e1c30; --muted:#556178; --card:#ffffff; --border:#e4e0d5; --gold:#a87d2c; --gold-soft:#f6eedb; --navy:#0b2545; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#0a1628; --fg:#e8ecf3; --muted:#9aa7bd; --card:#112139; --border:#22375a; --gold:#c9a35a; --gold-soft:#2a2a22; color-scheme:dark; }} }}
:root[data-theme="dark"] {{ --bg:#0a1628; --fg:#e8ecf3; --muted:#9aa7bd; --card:#112139; --border:#22375a; --gold:#c9a35a; --gold-soft:#2a2a22; color-scheme:dark; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }}
.hero {{ background:#0b2545; color:#fff; padding:56px 16px 48px; text-align:center; border-bottom:3px solid #c9a35a; }}
.hero img {{ width:84px; height:84px; background:#f3f2ec; border-radius:20px; padding:6px; }}
.hero h1 {{ font-family: "Cinzel", "Trajan Pro", Georgia, serif; text-wrap: balance; letter-spacing:.08em; font-size:clamp(24px,4vw,36px); margin:18px 0 4px; }}
.hero p {{ margin:4px auto; max-width:720px; color:#c3cede; }}
.hero .tag {{ color:#e6c98a; letter-spacing:.2em; font-size:12px; font-weight:700; text-transform:uppercase; }}
nav.toc {{ position:sticky; top:env(safe-area-inset-top, 0px); z-index:5; background:color-mix(in oklab, var(--bg) 92%, transparent); backdrop-filter:blur(8px); border-bottom:1px solid var(--border); display:flex; gap:6px; overflow-x:auto; padding:10px 16px; }}
nav.toc a {{ white-space:nowrap; color:var(--muted); text-decoration:none; font-size:13px; padding:4px 10px; border-radius:999px; border:1px solid var(--border); }}
nav.toc a:hover, nav.toc a:focus-visible {{ color:var(--fg); border-color:var(--gold); outline:none; }}
@media (prefers-reduced-motion: no-preference) {{ html {{ scroll-behavior: smooth; }} }}
main {{ max-width:1240px; margin:0 auto; padding:24px 16px 80px; }}
section {{ padding:36px 0; border-bottom:1px solid var(--border); scroll-margin-top:60px; }}
.eyebrow {{ margin:0; color:var(--gold); font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }}
h2 {{ text-wrap: balance; margin:4px 0 8px; font-size:clamp(20px,3vw,26px); }}
.lede {{ margin:0; color:var(--muted); max-width:820px; }}
.points {{ margin:12px 0 0; padding-left:18px; color:var(--fg); max-width:900px; columns:2 320px; column-gap:32px; }}
.points li {{ margin:2px 0; break-inside:avoid; }}
.figs {{ display:grid; gap:22px; margin-top:22px; }}
.figs-mobile {{ grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); }}
figure {{ margin:0; background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; }}
figure img {{ display:block; width:100%; height:auto; }}
figure.mobile img {{ max-width:430px; margin:0 auto; }}
figcaption {{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:12px 16px; border-top:1px solid var(--border); font-size:14px; }}
figcaption span:last-child {{ flex-basis:100%; color:var(--muted); }}
.role {{ font-size:11px; font-weight:600; padding:1px 8px; border-radius:999px; background:var(--gold-soft); color:var(--gold); }}
footer {{ text-align:center; color:var(--muted); font-size:13px; padding:24px 16px 48px; }}
</style>
<div class="hero"><img src="data:image/png;base64,{crest}" alt="Integral Academy crest">
<h1>INTEGRAL ACADEMY</h1><p class="tag">Executive Workspace · MVP tour</p>
<p>{html.escape(manifest["intro"])}</p></div>
<nav class="toc" aria-label="Sections">{"".join(toc)}</nav>
<main>{"".join(sections_html)}</main>
<footer>{html.escape(manifest["footer"])}</footer>"""
open(out, "w").write(page)
print(out, round(len(page) / 1024 / 1024, 2), "MB")
