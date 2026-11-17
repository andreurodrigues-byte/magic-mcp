# ColorCodesLegend.jsx

Script para Adobe Illustrator que gera uma legenda das cores do documento. Para
cada cor única encontrada, desenha uma amostra e escreve **nome**, **HEX**,
**CMYK**, **RGB** e o **Pantone Solid Coated mais próximo**.

```
┌──────────────────────────────────────────┐
│  VERMELHO DA MARCA    PANTONE 199 C dE 1.9│
│                                           │
│                                           │
│  HEX                              #E4002B │
│  RGB                            228, 0, 43│
│  CMYK                        0, 100, 81, 4│
└──────────────────────────────────────────┘
```

Dois layouts, via `CONFIG.layout`:

- **`"bento"`** (padrão) — cartões de cantos arredondados sobre um painel claro:
  nome no canto superior esquerdo, Pantone no direito, e os valores no rodapé em
  duas colunas. Com `bentoMosaic: true` os cartões passam a ter larguras e
  alturas variadas, como um bento de verdade.
- **`"grid"`** — grade simples, amostra em cima e rótulo em texto corrido abaixo.

Os grupos valem nos dois: cada um começa numa linha nova, com o título acima.

As proporções do cartão saíram de medir uma prancheta de referência pixel a
pixel, não de chute:

| | Valor |
| --- | --- |
| proporção do cartão (largura/altura) | 1,89 |
| padding interno | 5,6% da largura |
| corpo do texto | 3,1% da largura |
| **entrelinha do bloco de valores** | **2,4× o corpo** |
| respiro entre cartões | 3% da largura |

A entrelinha é o que mais muda o resultado. Em 1,3× as três linhas de valor
grudam no rodapé e o cartão fica apertado; em 2,4× elas respiram e o bloco lê
como tabela.

Dois detalhes que fazem o cartão funcionar:

- **A cor do texto é derivada da própria cor**, não preto ou branco chapado:
  mesma matiz, luminosidade empurrada para o lado oposto até atingir o contraste
  AA da WCAG (4.5:1). Dá magenta escuro sobre rosa, oliva sobre amarelo, rosa
  claro sobre vinho. Só cai para preto/branco quando nenhuma variação de
  luminosidade daquela matiz alcança o contraste.
- **A grade manda; o texto cede.** Um nome comprido encolhe o corpo do texto em
  vez de deformar a coluna — a grade regular é o que faz a prancheta ler como
  sistema. O cartão só alarga (`autoWidth`, até `maxSwatchW`) quando nem o corpo
  mínimo caberia, porque aí a alternativa seria texto ilegível.

## Como usar

1. Baixe `ColorCodesLegend.jsx`.
2. No Illustrator: **File > Scripts > Other Script…** (`Ctrl/Cmd + F12`) e
   aponte para o arquivo.

Para deixá-lo no menu, copie o arquivo para a pasta de scripts do Illustrator e
reinicie o programa:

- **macOS** — `/Applications/Adobe Illustrator <versão>/Presets/en_US/Scripts/`
- **Windows** — `C:\Program Files\Adobe\Adobe Illustrator <versão>\Presets\en_US\Scripts\`

### Colando os códigos (padrão)

Ao rodar, abre uma caixa. Cole a lista, um código por linha:

```
Principais
Rosa: 255, 153, 255
Amarelo: #F8F852
Copas: #851057

Secundárias
Bege: 255, 217, 218
Ouro: #FFDD17
```

O resto sai pronto: HEX, CMYK e o Pantone mais próximo de cada cor, já
separado em grupos. Não precisa ter as cores no documento.

| Escreve assim | Vira |
| --- | --- |
| `#F8F852`, `F8F852`, `#F9F` | hexadecimal (3 dígitos expandem) |
| `255, 153, 255` ou `255 153 255` ou `rgb(255,153,255)` | RGB — três números |
| `0, 40, 0, 0` | CMYK — quatro números |
| `Rosa: #F8F852`, `Rosa - #F8F852`, `- Rosa #F8F852` | nome + código |
| `Principais` | título de grupo (linha sem código) |

Só contam **três** números (RGB) ou **quatro** (CMYK) — por isso `Cores 2024` e
`Grid 3 x 3` continuam sendo título de grupo, não cor. Hexadecimal sem `#` só
vale como token isolado no fim da linha, para uma palavra que por acaso só tenha
letras de A a F não virar cor. Linha com valor fora de faixa é ignorada e
relatada no fim, sem derrubar as outras.

### Lendo do documento

Com `CONFIG.source` em `"auto"`, `"selection"` ou `"swatches"`, o script lê as
cores que já estão no arquivo em vez de abrir a caixa:

| Situação | O que ele lê |
| --- | --- |
| Há objetos selecionados | preenchimento e contorno dos objetos, entrando em grupos e traçados compostos |
| Nada selecionado | as swatches selecionadas no painel Swatches; se nenhuma, todas |

Gradientes, padrões e objetos sem preenchimento são ignorados, e o script avisa
quantos ficaram de fora.

## Configuração

Abra o `.jsx` num editor de texto: o bloco `CONFIG`, no topo, controla tudo.

| Opção | Padrão | O que faz |
| --- | --- | --- |
| `source` | `"input"` | `"input"` (caixa para colar), `"auto"`, `"selection"` ou `"swatches"` |
| `includeStrokes` | `true` | também coletar cor de contorno |
| `showName` / `showHex` / `showCMYK` / `showRGB` / `showPantone` | | liga e desliga cada linha do rótulo |
| `uppercaseName` | `true` | nome do cartão em caixa alta |
| `pantoneCount` | `1` | quantos Pantones listar; o 1º vai no cabeçalho, os demais viram linhas |
| `showDeltaE` | `"auto"` | `"auto"` (só em match fraco), `true` ou `false` |
| `deltaEThreshold` | `2.5` | acima disso o ΔE aparece no cartão |
| `layout` | `"bento"` | `"bento"` ou `"grid"` |
| `columns` | `3` | colunas da grade |
| `swatchW` / `swatchH` | `260` / `137` | cartão de 1 coluna, em pontos (proporção 1,89) |
| `autoWidth` | `true` | alarga o cartão só quando nem o corpo mínimo cabe |
| `maxSwatchW` | `420` | teto para esse alargamento |
| `bentoMosaic` | `false` | cartões de tamanhos variados em vez de uniformes |
| `cornerRadius` | `8` | arredondamento dos cartões |
| `panelColor` / `panelPadding` / `panelRadius` | branco / `19` / `16` | painel atrás dos cartões; `null` desliga |
| `backgroundColor` / `backgroundPadding` | cinza / `18` | fundo atrás do painel; `null` desliga |
| `minInkContrast` | `4.5` | contraste mínimo entre texto e cor do cartão |
| `gapX` / `gapY` | `8` / `10` | espaçamento entre cartões, em pontos |
| `textSize` | `8` | corpo do texto |
| `bentoLineSpacing` / `gridLineSpacing` | `2.4` / `1.35` | entrelinha, como fator do corpo |
| `minTextSize` | `6` | piso ao encolher texto que não coube |
| `bentoTallFactor` | `1.5` | altura das linhas altas do bento |
| `bentoPadding` | `15` | respiro entre a borda do cartão e o texto |
| `groupHeadingSize` | `13` | corpo do título de grupo |
| `groupHeadingGap` / `groupGapY` | `10` / `30` | respiro do título aos cartões, e entre grupos |
| `uppercaseGroup` | `true` | título de grupo em caixa alta |
| `fontName` | `""` | `""` usa a fonte padrão; ex.: `"Helvetica"` |
| `layerName` | `"Color Codes"` | camada de destino, reutilizada a cada execução |

Se algum rótulo ainda encostar na borda, o caminho é menos `columns` ou
`showDeltaE: false` — não `minTextSize` menor. Quando `autoWidth` bate no teto
de `maxSwatchW`, o texto encolhe até `minTextSize` e, a partir daí, transborda
de propósito: texto ilegível numa legenda de cor é pior que texto apertado.

## Sobre o Pantone: leia antes de mandar para gráfica

**O Illustrator não sabe converter uma cor em código Pantone.** A API só
consegue devolver o *nome* de uma spot color que já veio de uma biblioteca
Pantone. Não existe função de conversão — qualquer script que prometa isso está
consultando uma tabela, como este aqui.

Por padrão (`showDeltaE: "auto"`) o cartão sai limpo — só `PANTONE 235 C` — e o
ΔE aparece apenas quando o match é pior que `deltaEThreshold` (2,5). A maioria
das cores acha um Pantone a menos de 2 de ΔE; carimbar `dE 0.5` em todas só
roubaria espaço do cartão. Onde o ΔE aparece, ele está avisando de verdade.

O número `dE` é a distância perceptual
[CIEDE2000](https://en.wikipedia.org/wiki/Color_difference#CIEDE2000) entre a
sua cor e aquele Pantone: abaixo de 1 é imperceptível, 2–3 é perceptível lado a
lado, acima de 10 já é outra cor.

Isso vale inclusive quando a cor já é uma spot color: o nome exato dela sai no
título do cartão, mas o Pantone do cabeçalho continua sendo o resultado da busca
por proximidade, que pode cair em outro código.

Três limites que valem entender:

1. **Empates são comuns.** Vários Pantones vizinhos ficam a menos de 1 de ΔE
   entre si. Nos testes, `#E4002B` (que a marca declara como 185 C) tem 199 C,
   1795 C e 185 C todos entre 1.9 e 2.6 de ΔE. É por isso que o ΔE aparece
   junto do código, e por isso `pantoneCount: 2` existe: ele acrescenta o
   segundo colocado como linha do cartão, útil quando a escolha vai para
   produção.
2. **Tela não é tinta.** A tabela usa a renderização sRGB de cada Pantone. Cor
   impressa depende de papel, tinta e perfil; a amostra física manda.
3. **A cobertura é Solid Coated.** 1341 cores. Não inclui uncoated, metálicas,
   neons, pastéis nem a biblioteca de moda (TCX).

Nos testes com 11 cores de marca conhecidas, o Pantone declarado pela marca
aparece **em 1º lugar em 9 casos** e sempre entre os 3 primeiros.

### Comparado com outras ferramentas

Vale desconfiar de código Pantone vindo de gerador. Comparando com uma
prancheta feita por outra ferramenta, para as mesmas 9 cores, o ΔE do código
que ela escolheu contra o do escolhido aqui:

| Cor | Outra ferramenta | ΔE | Este script | ΔE |
| --- | --- | --- | --- | --- |
| `#FF3366` | 213 C | 8,3 | 191 C | **1,9** |
| `#FF6600` | 166 C | 6,0 | 1585 C | **1,2** |
| `#0099FF` | 2995 C | 10,0 | 279 C | **4,7** |
| `#F8F852` | 3935 C | 5,9 | 387 C | **3,8** |
| `#00CC61` | 7481 C | 6,4 | 7479 C | **4,7** |
| `#851057` | 235 C | 1,4 | 235 C | 1,4 |

Testei se ela usava distância euclidiana em RGB (o método ingênuo): não
reproduz as escolhas dela. É outra tabela Pantone, com renderizações sRGB
diferentes. Não dá para dizer qual tabela está certa sem um leque físico — mas
dá para dizer que, medindo contra a mesma referência, as escolhas daqui estão
mais perto.

## Origem dos dados

Tabela derivada de [thompsongl/pantonr](https://github.com/thompsongl/pantonr)
(MIT), conjunto Solid Coated.

O dataset traz `lab` (medição da tinta impressa) e `hex` (versão recortada para
tela), e os dois divergem: em azuis e cianos saturados a diferença chega a
ΔE 16 (300 C, Process Blue, Medium Blue), porque essas tintas caem fora do gamut
sRGB. Como a entrada do script é sempre uma cor de documento do Illustrator,
o match usa o `hex`, mantendo os dois lados no mesmo gamut. Medido no conjunto
de teste: hex acerta 9/12 em primeiro lugar (posição média 2.0), o lab medido
acerta 4/12 (posição média 8.3).

PANTONE® é marca registrada da Pantone LLC. Esta tabela é uma referência
aproximada e não é afiliada nem endossada pela Pantone.

## Desenvolvimento

`ColorCodesLegend.jsx` é **gerado**. Edite `ColorCodesLegend.template.jsx` e
rode o build:

```bash
git clone --depth 1 https://github.com/thompsongl/pantonr.git /tmp/pantonr
node illustrator/tools/build-pantone-table.cjs /tmp/pantonr/dist/pantone_coated.json
```

Testes (rodam em Node, sem Illustrator):

```bash
node illustrator/test/color-math.test.cjs   # matemática de cor e diagramação
node illustrator/test/integration.test.cjs  # script inteiro contra um DOM simulado
```

Preview da diagramação, sem abrir o Illustrator:

```bash
node illustrator/tools/preview.cjs bento   # gera illustrator/preview-bento.svg
node illustrator/tools/preview.cjs grid
```

O preview roda o mesmo `.jsx` contra o mesmo DOM simulado dos testes e desenha
em SVG os retângulos e textos que saíram — a geometria é a de verdade, só o meio
de saída muda. Vale a pena olhar depois de mexer em qualquer coisa de layout: foi
o preview, e não os testes de geometria, que revelou o rótulo vazando para fora
do bloco pela direita.

Os dois carregam o `.jsx` de verdade — o mesmo arquivo que roda no Illustrator,
não uma cópia. O CIEDE2000 é verificado contra o
[dataset de referência de Sharma, Wu & Dalal (2005)](http://www2.ece.rochester.edu/~gsharma/ciede2000/),
os 33 pares que quebram implementações ingênuas.

O teste de integração simula o DOM do Illustrator. Isso pega erro de digitação,
propriedade inexistente e lógica quebrada, mas **não valida o contrato da API da
Adobe** — um stub não substitui rodar no Illustrator.

### ExtendScript, não JavaScript moderno

O `.jsx` roda em ExtendScript (ES3). Nada de `const`/`let`, arrow functions,
`JSON`, `Array.prototype.map`/`forEach`/`indexOf` ou `String.prototype.trim` —
o script quebra no Illustrator. Use `var` e laços `for`.

O `main()` só é chamado se `app` existir, o que permite carregar o arquivo em
Node para testar sem disparar a execução.
