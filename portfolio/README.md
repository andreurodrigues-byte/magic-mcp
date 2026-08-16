# Portfólio — Ândreu Rodrigues

Site estático que replica o layout de grid escuro em duas colunas
(referência: `fabiookamoto.com.br/work`), com os projetos e as capas
importados do Adobe Portfolio atual.

## Estrutura

```
portfolio/
  build.py               gera index.html, sobre.html e contato.html
  data/projects.json     35 projetos: slug, título, ano, imagem, dimensões
  assets/css/style.css
  assets/js/main.js      revelação no scroll + voltar ao topo
  assets/img/work/*.webp capas 1280px (~2,8 MB no total)
```

O HTML é gerado, não editado à mão. Para mudar textos de nav, bio,
contato ou o destino dos cards, edite `build.py` / `data/projects.json`
e rode:

```bash
python3 build.py
```

## Rodar localmente

```bash
cd portfolio && python3 -m http.server 8000
# http://localhost:8000
```

## Onde os cards apontam

Hoje cada card leva para a página de case correspondente no Adobe
Portfolio (`SITE["case_base"]` em `build.py`), para nada quebrar durante
a transição. Quando os cases forem migrados para cá, basta esvaziar essa
constante e criar as páginas locais com o mesmo slug.

## Publicar

Conteúdo 100% estático — serve em Vercel, Netlify ou GitHub Pages
apontando para esta pasta, sem etapa de build no servidor.

## Atualizar as capas

`data/projects.json` guarda o `src` original no CDN do Adobe. Para
reimportar depois de mexer no Portfolio, rode o build de assets
novamente a partir da home publicada.
