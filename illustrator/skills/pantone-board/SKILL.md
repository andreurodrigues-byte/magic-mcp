---
name: pantone-board
description: Monta uma prancheta de cores para Adobe Illustrator a partir de uma lista de códigos. O usuário cola RGB, HEX ou CMYK e recebe um arquivo .jsx pronto para abrir no Illustrator, onde cada cor vira um cartão com nome, HEX, RGB, CMYK e o Pantone Solid Coated mais próximo, separado em grupos (principais, secundárias). Use quando o usuário colar uma lista de cores e pedir a prancheta, o arquivo do Illustrator, a paleta, os códigos Pantone, ou falar em manual de marca, guia de cores, identidade visual.
---

# Prancheta de cores para Illustrator

O usuário cola uma lista de cores. Você devolve **um `.jsx` com as cores já
embutidas** — ele abre no Illustrator e roda, sem redigitar nada — mais um
preview para conferir antes.

## Como fazer

1. **Salve a lista do usuário** num arquivo de texto, exatamente como ele
   escreveu. Não "limpe" nem reordene: o parser já aceita o que ele colou.

2. **Rode o gerador:**

   ```bash
   node scripts/build-board.cjs <lista.txt> <pasta-de-saida>
   ```

   Ele devolve, em JSON: o caminho do `.jsx`, o do `preview.svg`, e a tabela de
   cada cor com HEX, RGB, CMYK e o Pantone mais próximo com o ΔE.

3. **Entregue os dois arquivos** ao usuário (`ColorBoard.jsx` e `preview.svg`).
   O `.jsx` é o deliverable; o preview é só para conferir a diagramação.

4. **Diga como rodar**, se for a primeira vez: no Illustrator,
   **File > Scripts > Other Script…** (`Cmd + F12` no Mac) e aponte para o
   `ColorBoard.jsx`. Para deixar no menu fixo, copiar para
   `/Applications/Adobe Illustrator <versão>/Presets/en_US/Scripts/` e
   reiniciar o Illustrator.

## O formato que o usuário pode colar

Um código por linha. **Linha sem código vira título de grupo.**

```
Principais
Rosa: 255, 153, 255
Amarelo: #F8F852

Secundárias
Bege: 255, 217, 218
Ouro: #FFDD17
```

| Escreve assim | Vira |
| --- | --- |
| `#F8F852`, `F8F852`, `#F9F` | hexadecimal (3 dígitos expandem) |
| `255, 153, 255` / `255 153 255` / `rgb(255,153,255)` | RGB — três números |
| `0, 40, 0, 0` | CMYK — quatro números |
| `Rosa: #F8F852`, `Rosa - #F8F852`, `- Rosa #F8F852` | nome + código |
| `Principais` | título de grupo |

Só **três** números contam como RGB e **quatro** como CMYK, então `Cores 2024`
e `Grid 3 x 3` continuam sendo título de grupo.

## O que dizer sobre o Pantone

**Importante, não pule isto.** O Illustrator não converte cor em código
Pantone — a API só lê o *nome* de uma spot color que já veio de uma biblioteca
Pantone. O código que sai daqui vem de uma tabela e é **aproximação**, medida
por CIEDE2000 contra as 1341 cores Solid Coated.

Ao entregar, mencione em uma linha:

- Que o Pantone é o mais próximo, não uma leitura, e a amostra física manda.
- **Qualquer cor com ΔE acima de ~3**, nomeando-a. O JSON traz o `deltaE` de
  cada uma. Acima de 3 a diferença é visível lado a lado, e cores de tela
  saturadas (magentas, azuis, verdes elétricos) costumam não ter Pantone
  próximo — nesses casos o ΔE passa de 5 e vale avisar antes de ir para
  gráfica. O cartão já mostra o ΔE sozinho quando passa de 2,5.

Não invente código Pantone nem "corrija" o que o script escolheu: ele minimiza
distância perceptual sobre a tabela inteira.

## Ajustes que o usuário pode pedir

Tudo fica no bloco `CONFIG`, no topo do `.jsx` gerado. Os mais pedidos:

| Pedido | O que mudar |
| --- | --- |
| "mais/menos colunas" | `columns` (padrão 3) |
| "cartões maiores" | `swatchW` (a altura acompanha a proporção) |
| "tira o dE" | `showDeltaE: false` |
| "mostra o segundo Pantone" | `pantoneCount: 2` |
| "sem o fundo cinza" | `backgroundColor: null` |
| "sem o painel branco" | `panelColor: null` |
| "blocos de tamanhos variados" | `bentoMosaic: true` |
| "fonte X" | `fontName: "X"` |

Se o usuário pedir um ajuste, edite o `CONFIG` do `.jsx` já gerado e rode o
preview de novo para conferir:

```bash
node -e "require('./scripts/render-preview.cjs')(require('fs').readFileSync('<saida>/ColorBoard.jsx','utf8'),'<saida>/preview.svg')"
```

## Limites

- A cobertura é **Solid Coated** (1341 cores). Não inclui uncoated, metálicas,
  neons, pastéis nem a biblioteca de moda (TCX).
- O preview usa Helvetica e uma conversão CMYK simplificada. No Illustrator
  valem a fonte do documento e o perfil de cor dele, então os números de CMYK
  do arquivo final podem diferir um pouco dos do preview.
- O preview confere **diagramação**, não é prova de cor.
