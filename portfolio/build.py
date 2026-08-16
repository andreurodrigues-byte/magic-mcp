#!/usr/bin/env python3
"""Gera as páginas estáticas do portfólio a partir de data/projects.json.

Uso: python3 build.py
Saída: index.html, sobre.html, contato.html na raiz de portfolio/.
"""

import html
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
DATA = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))

SITE = {
    "name": "Ândreu Rodrigues",
    "role": "Diretor de Arte Sênior",
    "email": "andreurodrigues@gmail.com",
    "phone": "(61) 99376-0866",
    "phone_href": "+5561993760866",
    # Enquanto as páginas de case ainda vivem no Adobe Portfolio, os cards
    # apontam para lá. Troque por "" quando os cases forem migrados para cá.
    "case_base": "https://andreurodrigues.myportfolio.com/",
}

SOCIAL = [
    ("LinkedIn", "https://www.linkedin.com/in/%C3%A2ndreurodrigues/",
     "M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM0 8h5v16H0V8zm7.5 0h4.8v2.2h.07c.67-1.2 2.3-2.47 4.73-2.47 5.06 0 6 3.2 6 7.36V24h-5v-7.3c0-1.74-.03-3.98-2.6-3.98-2.6 0-3 1.9-3 3.85V24h-5V8z"),
    ("Instagram", "https://www.instagram.com/dreurod/",
     "M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 01-1.38-.9 3.8 3.8 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.9 5.9 0 00-2.13 1.38A5.9 5.9 0 00.63 4.14c-.3.76-.5 1.64-.56 2.9C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.66 1.34 1.07 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.9 5.9 0 002.13-1.38 5.9 5.9 0 001.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 00-1.38-2.13A5.9 5.9 0 0019.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zm0 10.16a4 4 0 110-8 4 4 0 010 8zm7.85-10.4a1.44 1.44 0 11-2.88 0 1.44 1.44 0 012.88 0z"),
    ("Behance", "https://www.behance.net/andreurodr8d7b",
     "M9.1 4.5c.6 0 1.15.05 1.65.16.5.1.92.28 1.27.52.35.24.62.57.81.98.19.4.28.9.28 1.5 0 .64-.15 1.18-.44 1.6-.29.43-.72.78-1.29 1.05.78.22 1.36.62 1.74 1.18.38.57.57 1.25.57 2.05 0 .65-.13 1.2-.38 1.67a3.1 3.1 0 01-1.02 1.14c-.43.3-.92.51-1.47.65-.55.14-1.11.21-1.69.21H1.5V4.5h7.6zM8.65 9.6c.5 0 .91-.12 1.23-.36.32-.24.48-.62.48-1.15 0-.3-.05-.54-.16-.73a1.1 1.1 0 00-.43-.44 1.8 1.8 0 00-.62-.22 4.2 4.2 0 00-.73-.06H4.7V9.6h3.95zm.22 5.36c.28 0 .54-.03.79-.08.25-.06.47-.15.66-.28.19-.13.34-.31.45-.53.11-.23.17-.52.17-.87 0-.69-.2-1.18-.58-1.48-.39-.29-.9-.44-1.54-.44H4.7v3.68h4.17zM17.9 14.9c.43.42 1.05.63 1.86.63.58 0 1.08-.15 1.5-.44.42-.29.68-.6.77-.92h2.36c-.38 1.17-.96 2.01-1.74 2.51-.78.5-1.72.75-2.83.75-.77 0-1.46-.12-2.08-.37a4.35 4.35 0 01-1.57-1.06 4.7 4.7 0 01-.99-1.63 6 6 0 01-.35-2.08c0-.74.12-1.42.36-2.05a4.77 4.77 0 012.58-2.73 5.2 5.2 0 012.05-.39c.85 0 1.6.16 2.24.49.64.33 1.16.78 1.57 1.33.41.56.7 1.2.88 1.91.18.72.24 1.47.19 2.25h-7.19c0 .82.28 1.4.71 1.8zM21.13 10c-.34-.38-.9-.58-1.62-.58-.47 0-.86.08-1.17.24a2.3 2.3 0 00-.74.58c-.19.23-.32.48-.39.74-.08.26-.12.49-.13.7h4.45c-.13-.7-.35-1.29-.4-1.68zM17.1 5.4h5.55v1.35H17.1V5.4z"),
]


def esc(text):
    return html.escape(str(text), quote=True)


def head(title, description, css_depth=""):
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="{css_depth}assets/css/style.css">
</head>
<body>"""


def header(current):
    def link(href, label):
        aria = ' aria-current="page"' if href == current else ""
        return f'<a href="{href}"{aria}>{label}</a>'

    return f"""
<header class="site-header">
  <div class="container">
    <a class="wordmark" href="index.html">{esc(SITE['name'])}</a>
    <nav class="site-nav" aria-label="Principal">
      {link('index.html', 'Trabalhos')}
      {link('sobre.html', 'Sobre')}
      {link('contato.html', 'Contato')}
    </nav>
  </div>
</header>
<main>"""


def footer():
    icons = "\n      ".join(
        f'<a href="{url}" target="_blank" rel="noopener" aria-label="{name}">'
        f'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="{path}"/></svg></a>'
        for name, url, path in SOCIAL
    )
    return f"""</main>
<footer class="site-footer">
  <div class="container">
    <div class="social">
      {icons}
    </div>
    <p class="colophon">&copy; 2026 {esc(SITE['name'])} &middot; {esc(SITE['role'])}</p>
    <a class="to-top" href="#top" aria-label="Voltar ao topo">&uarr;</a>
  </div>
</footer>
<script src="assets/js/main.js"></script>
</body>
</html>
"""


def work_grid():
    cards = []
    for i, p in enumerate(DATA):
        href = SITE["case_base"] + p["slug"]
        external = ' target="_blank" rel="noopener"' if SITE["case_base"] else ""
        loading = "eager" if i < 4 else "lazy"
        cards.append(f"""    <a class="work-item" href="{esc(href)}"{external}>
      <img class="work-item__img" src="{esc(p['img'])}" alt="{esc(p['title'])}"
           width="{p['w']}" height="{p['h']}" loading="{loading}" decoding="async">
      <div class="work-item__overlay">
        <h2 class="work-item__title">{esc(p['title'])}</h2>
        <span class="work-item__year">{esc(p['year'])}</span>
      </div>
    </a>""")
    return ('<h1 class="visually-hidden">Trabalhos</h1>\n'
            '  <div class="work-grid container" id="top">\n'
            + "\n".join(cards) + "\n  </div>")


def write(name, body):
    (ROOT / name).write_text(body, encoding="utf-8")
    print(f"gerado: {name}")


def main():
    write("index.html",
          head(f"{SITE['name']} — {SITE['role']}",
               "Portfólio de direção de arte, identidade visual e campanhas.")
          + header("index.html") + work_grid() + footer())

    sobre = f"""<div class="page container" id="top">
    <h1>Sobre</h1>
    <p>{esc(SITE['name'])} é {esc(SITE['role'].lower())} em Brasília, com trabalhos em
       identidade visual, campanhas institucionais e comunicação para marcas e
       instituições públicas.</p>
    <p>Este é um resumo &mdash; substitua por sua bio definitiva.</p>
    <p><a href="contato.html">Vamos conversar &rarr;</a></p>
  </div>"""
    write("sobre.html",
          head(f"Sobre — {SITE['name']}", f"Sobre {SITE['name']}, {SITE['role']}.")
          + header("sobre.html") + sobre + footer())

    contato = f"""<div class="page container" id="top">
    <h1>Contato</h1>
    <ul class="contact-list">
      <li><span class="label">Email</span>
          <a href="mailto:{esc(SITE['email'])}">{esc(SITE['email'])}</a></li>
      <li><span class="label">Telefone</span>
          <a href="tel:{esc(SITE['phone_href'])}">{esc(SITE['phone'])}</a></li>
      <li><span class="label">LinkedIn</span>
          <a href="{SOCIAL[0][1]}" target="_blank" rel="noopener">/ândreurodrigues</a></li>
    </ul>
  </div>"""
    write("contato.html",
          head(f"Contato — {SITE['name']}", f"Fale com {SITE['name']}.")
          + header("contato.html") + contato + footer())


if __name__ == "__main__":
    main()
