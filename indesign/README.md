# Apresentações automáticas no InDesign

Fluxo para montar uma apresentação inteira a partir de **uma pasta** com o modelo, um arquivo de conteúdo e as imagens. Você prepara o modelo uma vez; depois cada apresentação nova é só trocar o conteúdo da pasta e rodar o script.

```
indesign/
├── scripts/
│   ├── GerarApresentacao.jsx      ← monta a apresentação
│   └── ListarCamposDoModelo.jsx   ← inspeciona o modelo e gera o esqueleto do conteúdo
└── exemplo-projeto/               ← estrutura de pasta de referência
```

---

## 1. Como organizar a pasta do projeto

Uma pasta por apresentação, sempre com a mesma estrutura:

```
Apresentacao-Cliente-X/
├── modelo.indt          ← o modelo (páginas-mestre + estilos). Pode ser .indd
├── conteudo.json        ← todos os textos e o mapa de imagens
├── imagens/
│   ├── capa.jpg
│   ├── conceito.jpg
│   └── ref-01.jpg
└── saida/               ← criada pelo script (documento final + relatório)
```

Regras que evitam 90% dos problemas:

- **Nomes de arquivo sem acento e sem espaço** (`ref-01.jpg`, não `Ref 01 – final.jpg`).
- O modelo fica na **raiz** da pasta. Se houver mais de um, aponte qual em `documento.modelo`.
- Nada é editado dentro do modelo — o script salva o resultado em `saida/`. O modelo continua limpo para a próxima apresentação.
- Prefira `.indt` (arquivo de modelo do InDesign): ele abre como documento novo, então não há risco de sobrescrever.

Para arquivar/versionar: mantenha um `modelo/` central com a marca e copie-o para cada projeto, ou deixe o modelo em uma pasta compartilhada e use um caminho em `documento.modelo` (`"../_marca/modelo-2026.indt"`).

---

## 2. Como preparar o modelo (feito uma vez)

**Uma página-mestre por tipo de slide.** Exemplo: `A-Capa`, `B-Texto`, `C-Texto e Imagem`, `D-Galeria`, `E-Encerramento`. O nome da mestre é o que você escreve em `"layout"` no conteúdo.

Nessa mestre, desenhe os frames como quiser (posição, estilos de parágrafo, cores, grid). Depois marque os frames que recebem conteúdo, de uma das duas formas — as duas funcionam juntas:

### a) Script Label — para textos e imagens

1. Selecione o frame.
2. **Janela > Utilitários > Rótulo de script** (*Script Label*).
3. Digite o nome do campo: `titulo`, `corpo`, `foto`, `imagem-fundo`.

É o único jeito de preencher **imagens**, e é o mais preciso para texto (o frame inteiro é substituído, preservando o estilo de parágrafo aplicado).

### b) Marcador `{{campo}}` — só para texto

Escreva o marcador direto no texto da mestre:

> **{{titulo}}**
> Proposta para {{cliente}} — {{data}}

Serve para texto corrido misturado com conteúdo fixo. O script troca o marcador pelo valor e apaga os marcadores que ficaram sem valor.

### Comparação rápida

| | Script Label | `{{marcador}}` |
|---|---|---|
| Textos | ✅ substitui o frame inteiro | ✅ substitui no meio do texto |
| Imagens | ✅ | ❌ |
| Preparo no modelo | rotular cada frame | só digitar |
| Melhor para | títulos, blocos de texto, fotos | assinatura, datas, nome do cliente |

O nome do campo é comparado **ignorando maiúsculas, acentos e hífens**: `Título`, `titulo` e `TITULO` são o mesmo campo.

### Descobrir o que já existe no modelo

Com o modelo aberto, rode **`ListarCamposDoModelo.jsx`**. Ele gera, ao lado do modelo:

- `campos-do-modelo.txt` — cada página-mestre com seus rótulos de texto, rótulos de imagem e marcadores;
- `conteudo-exemplo.json` — um esqueleto já preenchido com os nomes certos. Renomeie para `conteudo.json` e edite.

---

## 3. Como escrever o `conteudo.json`

```json
{
  "documento": {
    "nomeSaida": "apresentacao-cliente-x",
    "ajustarTextoQueNaoCabe": true
  },
  "variaveis": {
    "cliente": "Cliente X",
    "data": "Agosto de 2026"
  },
  "slides": [
    {
      "layout": "A-Capa",
      "textos": { "titulo": "Campanha 2026", "subtitulo": "Proposta" },
      "imagens": { "imagem-fundo": "imagens/capa.jpg" }
    },
    {
      "layout": "B-Texto",
      "textos": {
        "titulo": "Contexto",
        "corpo": ["Primeiro parágrafo.", "Segundo parágrafo."]
      }
    }
  ]
}
```

- A **ordem dos slides** no arquivo é a ordem das páginas.
- Repetir o mesmo `layout` quantas vezes quiser é o normal.
- `textos`: string simples, ou **lista** — cada item vira um parágrafo.
- `imagens`: `"imagens/foto.jpg"` ou `{ "arquivo": "...", "ajuste": "preencher", "opacidade": 60 }`.
- `variaveis`: valores que valem para todos os slides, usados como `{{cliente}}`.
- `{{numeroSlide}}` está sempre disponível.

O arquivo é lido como objeto JavaScript, então **comentários `//` e vírgula sobrando são aceitos** — útil para deixar slides desativados com um comentário.

### Referência de `documento`

| Campo | Padrão | O que faz |
|---|---|---|
| `modelo` | primeiro `.indt`/`.indd` da pasta | Caminho do modelo |
| `nomeSaida` | `apresentacao` | Nome do arquivo gerado |
| `pastaSaida` | `saida` | Onde salvar |
| `ajustarTextoQueNaoCabe` | `true` | Reduz o corpo em passos de 4% até o texto caber |
| `exportarPDF` | `false` | Também exporta PDF |
| `presetPDF` | `[High Quality Print]` | Preset de exportação |
| `empacotar` | `false` | Roda Empacotar (fontes + links + relatório) |

### Modos de `ajuste` da imagem

| Valor | Efeito |
|---|---|
| `preencher` (padrão) | Preenche o frame proporcionalmente e centraliza; corta o excedente |
| `conter` | Cabe inteira dentro do frame, pode sobrar espaço |
| `esticar` | Deforma a imagem até o tamanho do frame |
| `frameAoConteudo` | O frame se ajusta à imagem |

---

## 4. Como rodar

**Instalar os scripts** (uma vez): no InDesign, **Janela > Utilitários > Scripts**. Clique com o botão direito na pasta **Usuário > Revelar no Finder / Explorer** e copie os dois `.jsx` para lá.

**Gerar**:

1. Duplo clique em `GerarApresentacao.jsx` no painel Scripts.
2. Selecione a pasta do projeto.
3. Ao final aparece um resumo com a contagem de avisos e erros.

O resultado fica em `saida/`:

- `nomeSaida.indd` — documento montado, editável;
- `relatorio.txt` — o que foi preenchido, o que faltou e o que foi ajustado.

Leia o relatório sempre. Ele registra imagem não encontrada, rótulo inexistente na mestre, texto que não coube e marcador sem valor — cada um com o número do slide.

---

## 5. Fluxo de trabalho sugerido

1. **Modelo primeiro.** Desenhe as mestres e rotule os frames. Rode `ListarCamposDoModelo.jsx` para conferir se todos os rótulos aparecem como você espera.
2. **Conteúdo em paralelo.** Quem escreve preenche o `conteudo.json` a partir do esqueleto gerado; quem produz joga as imagens em `imagens/`.
3. **Rode e leia o relatório.** Corrija o `conteudo.json` e rode de novo — é rápido, e cada execução regrava `saida/`.
4. **Finalize à mão.** Ajustes finos de layout são feitos no `.indd` gerado. Se precisar mudar o conteúdo depois disso, ajuste o `conteudo.json` e regenere, para não perder o sincronismo entre fonte e arquivo.
5. **Arquive a pasta inteira.** Ela é autossuficiente: modelo + conteúdo + imagens reproduzem o resultado a qualquer momento.

Regenerar sempre sobrescreve `saida/`. Se um `.indd` já finalizado precisa ser preservado, mova-o para fora de `saida/` ou troque o `nomeSaida`.

---

## 6. Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `pagina-mestre "X" nao existe` | Nome em `layout` ≠ nome da mestre | O relatório lista as mestres disponíveis; copie o nome de lá |
| `nenhum frame com o rotulo "foto"` | Frame sem Script Label, ou rótulo em página comum em vez da mestre | Rotule o frame **na página-mestre** |
| `imagem nao encontrada` | Caminho errado | Confira `imagens/`; nomes sem acento |
| Texto não entra no frame | O rótulo está num frame gráfico | Rótulos de texto só funcionam em frames de texto |
| Texto sai menor que no modelo | `ajustarTextoQueNaoCabe` reduziu o corpo | Encurte o texto ou aumente o frame na mestre; ou desligue a opção |
| Elementos do layout somem | Item bloqueado na mestre não pôde ser liberado | Desbloqueie o item na mestre |
| Erro de leitura do `conteudo.json` | Aspas ou chave faltando | A mensagem indica onde; use aspas retas `"` |

---

## 7. Limites

- Os scripts são **ExtendScript (`.jsx`)** e rodam dentro do InDesign — não dá para executá-los pelo terminal nem em CI sem uma instalação do InDesign (para isso seria InDesign Server ou UXP Script).
- Cada página é gerada a partir de uma mestre; layouts que variam de página para página precisam virar mestres diferentes.
- Não há geração de sumário, numeração automática de seções nem tabelas — se precisar, dá para estender `montarPagina()` em `GerarApresentacao.jsx`.
