# ColorCodesLegend.jsx

Script para Adobe Illustrator que gera uma legenda das cores do documento. Para
cada cor única encontrada, desenha uma amostra e escreve **nome**, **HEX**,
**CMYK**, **RGB** e o **Pantone Solid Coated mais próximo**.

```
┌─────────────────────────────
│ Vermelho da marca
│ HEX #E4002B
│ CMYK 0 100 81 4
│ ~ PANTONE 199 C  dE 1.9
│ ~ PANTONE 1795 C  dE 2.2
└─────────────────────────────
```

## Como usar

1. Baixe `ColorCodesLegend.jsx`.
2. No Illustrator: **File > Scripts > Other Script…** (`Ctrl/Cmd + F12`) e
   aponte para o arquivo.

Para deixá-lo no menu, copie o arquivo para a pasta de scripts do Illustrator e
reinicie o programa:

- **macOS** — `/Applications/Adobe Illustrator <versão>/Presets/en_US/Scripts/`
- **Windows** — `C:\Program Files\Adobe\Adobe Illustrator <versão>\Presets\en_US\Scripts\`

O script decide sozinho de onde tirar as cores:

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
| `source` | `"auto"` | `"auto"`, `"selection"` ou `"swatches"` |
| `includeStrokes` | `true` | também coletar cor de contorno |
| `showName` / `showHex` / `showCMYK` / `showRGB` / `showPantone` | | liga e desliga cada linha do rótulo |
| `pantoneCount` | `2` | quantos Pantones próximos listar |
| `maxDeltaE` | `10` | acima disso o match vira `~~` |
| `columns` | `5` | colunas da grade |
| `swatchW` / `swatchH` / `gapX` / `gapY` | | tamanho e espaçamento, em pontos |
| `textSize` | `9` | corpo do texto |
| `fontName` | `""` | `""` usa a fonte padrão; ex.: `"Helvetica"` |
| `layerName` | `"Color Codes"` | camada de destino, reutilizada a cada execução |

## Sobre o Pantone: leia antes de mandar para gráfica

**O Illustrator não sabe converter uma cor em código Pantone.** A API só
consegue devolver o *nome* de uma spot color que já veio de uma biblioteca
Pantone. Não existe função de conversão — qualquer script que prometa isso está
consultando uma tabela, como este aqui.

Por isso toda linha de Pantone sai marcada:

| Marca | Significado |
| --- | --- |
| `~` | aproximação dentro de `maxDeltaE` |
| `~~` | aproximação fraca, confira num leque físico |

O número `dE` é a distância perceptual [CIEDE2000](https://en.wikipedia.org/wiki/Color_difference#CIEDE2000):
abaixo de 1 é imperceptível, 2–3 é perceptível lado a lado, acima de 10 já é
outra cor.

Três limites que valem entender:

1. **Empates são comuns.** Vários Pantones vizinhos ficam a menos de 1 de ΔE
   entre si. Nos testes, `#E4002B` (que a marca declara como 185 C) tem 199 C,
   1795 C e 185 C todos entre 1.9 e 2.6 de ΔE. Por isso o padrão lista dois
   candidatos em vez de fingir que existe uma resposta única.
2. **Tela não é tinta.** A tabela usa a renderização sRGB de cada Pantone. Cor
   impressa depende de papel, tinta e perfil; a amostra física manda.
3. **A cobertura é Solid Coated.** 1341 cores. Não inclui uncoated, metálicas,
   neons, pastéis nem a biblioteca de moda (TCX).

Nos testes com 11 cores de marca conhecidas, o Pantone declarado pela marca
aparece **em 1º lugar em 9 casos** e sempre entre os 3 primeiros.

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
node illustrator/test/color-math.test.cjs   # matemática de cor
node illustrator/test/integration.test.cjs  # script inteiro contra um DOM simulado
```

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
