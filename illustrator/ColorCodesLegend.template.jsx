/*
 * ColorCodesLegend.jsx
 *
 * Gera uma legenda de cores no documento do Illustrator: para cada cor unica
 * encontrada, desenha uma amostra e escreve NOME, HEX, CMYK, RGB e o PANTONE
 * (Solid Coated) mais proximo.
 *
 * Rode com File > Scripts > Other Script... (Ctrl/Cmd + F12).
 *
 * Escrito em ExtendScript (ES3): sem const/let, sem JSON, sem metodos de
 * Array de ES5. Nao altere isso ou o script quebra no Illustrator.
 *
 * Tabela Pantone derivada de https://github.com/thompsongl/pantonr (MIT).
 * Ver illustrator/README.md para as limitacoes do match.
 */

// ============================================================================
// CONFIG - ajuste aqui
// ============================================================================
var CONFIG = {
    // "input"     = abre uma caixa para colar a lista de codigos (RGB, HEX ou
    //               CMYK), com titulos de grupo. Nao precisa ter as cores no
    //               documento. Ver parseColorInput para o formato aceito.
    // "auto"      = usa a selecao; se nada estiver selecionado, usa as swatches
    // "selection" = so os objetos selecionados
    // "swatches"  = so o painel Swatches (as selecionadas, ou todas)
    source: "input",

    includeStrokes: true, // tambem coletar cor de contorno dos objetos

    showName: true, // nome da swatch / spot, no canto superior esquerdo
    uppercaseName: true,
    showHex: true,
    showCMYK: true,
    showRGB: true,
    showPantone: true,

    // Quantos Pantones mais proximos listar. O primeiro vai para o cabecalho do
    // cartao; do segundo em diante viram linhas do bloco de valores. Empates
    // dentro de 1-2 de Delta E sao comuns, entao 2 e util quando a escolha vai
    // para producao - so deixa o cartao mais cheio. Ver illustrator/README.md.
    pantoneCount: 1,

    // Mostra a distancia perceptual junto do codigo: "PANTONE 454 C  dE 2.6".
    //   "auto"  so quando o match for pior que deltaEThreshold (padrao)
    //   true    sempre
    //   false   nunca
    // "auto" deixa o cartao limpo no caso comum e avisa exatamente onde
    // importa: a maioria das cores acha um Pantone a menos de 2 de dE, e
    // carimbar "dE 0.5" em todas so rouba espaco do cartao.
    showDeltaE: "auto",

    // Acima disto o match e fraco o bastante para o dE aparecer no cartao.
    // 1 = imperceptivel, 2-3 = perceptivel lado a lado, >10 = outra cor.
    deltaEThreshold: 2.5,

    // "bento" = cartoes de cantos arredondados sobre um painel, com nome e
    //           Pantone no topo e os valores em duas colunas embaixo
    // "grid"  = grade simples, amostra em cima e rotulo em texto corrido abaixo
    layout: "bento",

    columns: 3,

    /*
     * Proporcoes do cartao.
     *
     * Os numeros abaixo vem de medir uma prancheta de referencia pixel a
     * pixel: cartao de 269x142, padding 15, corpo ~8.3, entrelinha 20,
     * respiro 8 entre cartoes.
     * Normalizado pela largura do cartao:
     *
     *   altura        = largura / 1.89
     *   padding       = 5.6% da largura
     *   corpo         = 3.1% da largura
     *   entrelinha    = 2.4x o corpo   <- o que da o ar de tabela
     *   respiro       = 3% da largura
     *
     * A entrelinha e o que mais muda o resultado: em 1.3x as tres linhas de
     * valor grudam no rodape e o cartao fica apertado; em 2.2x elas respiram.
     */
    swatchW: 260, // no bento, largura de 1 coluna; blocos largos ocupam 2
    swatchH: 137, // 260 / 1.89

    /*
     * Quando o conteudo nao cabe na largura do cartao, o que cede primeiro.
     *
     * O padrao e encolher o texto: a grade regular e o que faz a prancheta ler
     * como sistema, e um nome comprido nao deveria deformar a coluna inteira.
     * So quando o corpo chegaria abaixo de minTextSize o cartao alarga, ate
     * maxSwatchW. (Antes era o contrario, e um unico nome longo inflava tudo.)
     */
    autoWidth: true,
    maxSwatchW: 420,

    // Mosaico: blocos de larguras e alturas variadas, como um bento de verdade.
    // Desligado deixa todos os cartoes do mesmo tamanho, que e o mais comum em
    // guia de marca.
    bentoMosaic: false,

    cornerRadius: 8,

    // Painel claro atras dos cartoes e fundo atras dele. null desliga cada um.
    // Valores em RGB 0-255; num documento CMYK sao convertidos.
    panelColor: [255, 255, 255],
    panelPadding: 19,
    panelRadius: 16,
    backgroundColor: [223, 223, 223],
    backgroundPadding: 18,

    // Contraste minimo (WCAG) entre o texto e a cor do cartao. 4.5 e o criterio
    // AA para texto normal.
    minInkContrast: 4.5,
    gapX: 8,
    gapY: 10, // no bento vale para os dois eixos
    textSize: 8,
    // Corpo minimo. Rotulo que nao cabe na largura do cartao encolhe ate aqui;
    // so entao o cartao alarga (ver autoWidth).
    minTextSize: 6,
    fontName: "", // "" = fonte padrao do documento. Ex.: "Helvetica"

    // Entrelinha, como fator do corpo. No bento as linhas de valor sao uma
    // tabela e pedem ar; no grid sao um paragrafo e pedem o contrario.
    bentoLineSpacing: 2.4,
    gridLineSpacing: 1.35,

    // So no bento: altura das linhas altas do mosaico, como fator de swatchH.
    bentoTallFactor: 1.5,
    // So no bento: respiro entre a borda do cartao e o texto, em pontos.
    bentoPadding: 15,

    // Titulos de grupo ("Principais", "Secundarias").
    groupHeadingSize: 13,
    groupHeadingGap: 10, // do titulo ate a primeira linha de cartoes
    groupGapY: 30,       // entre o fim de um grupo e o titulo do proximo
    uppercaseGroup: true,

    layerName: "Color Codes"
};

// ============================================================================
// Tabela Pantone Solid Coated: "codigo;RRGGBB" separados por "|".
// Gerada por illustrator/tools/build-pantone-table.cjs - ver aquele arquivo
// para a origem dos dados e o porque de o match usar hex, e nao Lab medido.
// ============================================================================
var PANTONE_TABLE = "/*__PANTONE_TABLE__*/";

// ============================================================================
// Conversao de cor (funcoes puras - cobertas por illustrator/test)
// ============================================================================

function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

function toHex(rgb) {
    var out = "#";
    for (var i = 0; i < 3; i++) {
        var v = Math.round(clamp(rgb[i], 0, 255));
        var h = v.toString(16).toUpperCase();
        if (h.length < 2) h = "0" + h;
        out += h;
    }
    return out;
}

/* sRGB 0-255 -> CIE Lab D65 */
function rgbToLab(rgb) {
    var lin = [];
    for (var i = 0; i < 3; i++) {
        var c = clamp(rgb[i], 0, 255) / 255;
        lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    var x = lin[0] * 0.4124564 + lin[1] * 0.3575761 + lin[2] * 0.1804375;
    var y = lin[0] * 0.2126729 + lin[1] * 0.7151522 + lin[2] * 0.0721750;
    var z = lin[0] * 0.0193339 + lin[1] * 0.1191920 + lin[2] * 0.9503041;

    // ponto branco D65
    var xyz = [x / 0.95047, y / 1.00000, z / 1.08883];
    var f = [];
    for (var j = 0; j < 3; j++) {
        f[j] = xyz[j] > 0.008856451679
            ? Math.pow(xyz[j], 1 / 3)
            : (903.2962962 * xyz[j] + 16) / 116;
    }

    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

/* Fallback quando app.convertSampleColor nao esta disponivel. */
function cmykToRgbNaive(cmyk) {
    var out = [];
    for (var i = 0; i < 3; i++) {
        out[i] = 255 * (1 - clamp(cmyk[i], 0, 100) / 100) * (1 - clamp(cmyk[3], 0, 100) / 100);
    }
    return out;
}

function rgbToCmykNaive(rgb) {
    var r = clamp(rgb[0], 0, 255) / 255;
    var g = clamp(rgb[1], 0, 255) / 255;
    var b = clamp(rgb[2], 0, 255) / 255;
    var k = 1 - Math.max(r, Math.max(g, b));
    if (k >= 1) return [0, 0, 0, 100];
    return [
        ((1 - r - k) / (1 - k)) * 100,
        ((1 - g - k) / (1 - k)) * 100,
        ((1 - b - k) / (1 - k)) * 100,
        k * 100
    ];
}

/* CIEDE2000 - implementacao de Sharma, Wu & Dalal (2005). */
function deltaE2000(lab1, lab2) {
    var kL = 1, kC = 1, kH = 1;
    var deg = Math.PI / 180;

    var L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    var L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];

    var C1 = Math.sqrt(a1 * a1 + b1 * b1);
    var C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cbar = (C1 + C2) / 2;

    var Cbar7 = Math.pow(Cbar, 7);
    var G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625))); // 25^7

    var a1p = (1 + G) * a1;
    var a2p = (1 + G) * a2;
    var C1p = Math.sqrt(a1p * a1p + b1 * b1);
    var C2p = Math.sqrt(a2p * a2p + b2 * b2);

    var h1p = (b1 === 0 && a1p === 0) ? 0 : Math.atan2(b1, a1p) / deg;
    if (h1p < 0) h1p += 360;
    var h2p = (b2 === 0 && a2p === 0) ? 0 : Math.atan2(b2, a2p) / deg;
    if (h2p < 0) h2p += 360;

    var dLp = L2 - L1;
    var dCp = C2p - C1p;

    var dhp;
    if (C1p * C2p === 0) {
        dhp = 0;
    } else if (Math.abs(h2p - h1p) <= 180) {
        dhp = h2p - h1p;
    } else if (h2p - h1p > 180) {
        dhp = h2p - h1p - 360;
    } else {
        dhp = h2p - h1p + 360;
    }
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * deg);

    var Lbarp = (L1 + L2) / 2;
    var Cbarp = (C1p + C2p) / 2;

    var hbarp;
    if (C1p * C2p === 0) {
        hbarp = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
        hbarp = (h1p + h2p) / 2;
    } else if (h1p + h2p < 360) {
        hbarp = (h1p + h2p + 360) / 2;
    } else {
        hbarp = (h1p + h2p - 360) / 2;
    }

    var T = 1
        - 0.17 * Math.cos((hbarp - 30) * deg)
        + 0.24 * Math.cos((2 * hbarp) * deg)
        + 0.32 * Math.cos((3 * hbarp + 6) * deg)
        - 0.20 * Math.cos((4 * hbarp - 63) * deg);

    var dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    var Cbarp7 = Math.pow(Cbarp, 7);
    var RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 6103515625));
    var Lbarp50 = Math.pow(Lbarp - 50, 2);
    var SL = 1 + (0.015 * Lbarp50) / Math.sqrt(20 + Lbarp50);
    var SC = 1 + 0.045 * Cbarp;
    var SH = 1 + 0.015 * Cbarp * T;
    var RT = -Math.sin((2 * dTheta) * deg) * RC;

    var termL = dLp / (kL * SL);
    var termC = dCp / (kC * SC);
    var termH = dHp / (kH * SH);

    return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH);
}

/* Parseia PANTONE_TABLE uma unica vez, ja convertendo para Lab. */
var _pantoneCache = null;
function getPantoneList() {
    if (_pantoneCache) return _pantoneCache;

    var list = [];
    var rows = PANTONE_TABLE.split("|");
    for (var i = 0; i < rows.length; i++) {
        var parts = rows[i].split(";");
        if (parts.length !== 2) continue;

        var hex = parts[1];
        if (hex.length !== 6) continue;

        var rgb = [
            parseInt(hex.substring(0, 2), 16),
            parseInt(hex.substring(2, 4), 16),
            parseInt(hex.substring(4, 6), 16)
        ];
        if (isNaN(rgb[0]) || isNaN(rgb[1]) || isNaN(rgb[2])) continue;

        list.push({ name: parts[0], hex: "#" + hex, lab: rgbToLab(rgb) });
    }
    _pantoneCache = list;
    return list;
}

/*
 * Retorna os `count` Pantones Solid Coated mais proximos, do melhor para o
 * pior: [{name, hex, deltaE}, ...].
 */
function nearestPantone(rgb, count) {
    if (count == null || count < 1) count = 1;

    var lab = rgbToLab(rgb);
    var list = getPantoneList();
    if (!list.length) return [];

    // Insercao numa lista curta: mais barato que ordenar as 1341 entradas.
    var best = [];
    for (var i = 0; i < list.length; i++) {
        var d = deltaE2000(lab, list[i].lab);
        if (best.length === count && d >= best[best.length - 1].deltaE) continue;

        var entry = { name: "PANTONE " + list[i].name, hex: list[i].hex, deltaE: d };
        var pos = best.length;
        while (pos > 0 && best[pos - 1].deltaE > d) {
            best[pos] = best[pos - 1];
            pos--;
        }
        best[pos] = entry;
        if (best.length > count) best.length = count;
    }
    return best;
}

/*
 * Escolhe preto ou branco para escrever em cima de uma cor, pela razao de
 * contraste da WCAG 2.1. Devolve "black" ou "white".
 *
 * Nao e "escuro? entao branco": no meio da escala a conta muda de lado. Um
 * amarelo forte tem luminancia alta e pede preto; um azul medio, do mesmo
 * brilho aparente, pede branco.
 */
function relativeLuminance(rgb) {
    var lin = [];
    for (var i = 0; i < 3; i++) {
        var c = clamp(rgb[i], 0, 255) / 255;
        lin[i] = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function pickTextColor(rgb) {
    var L = relativeLuminance(rgb);
    var contrastWithWhite = 1.05 / (L + 0.05);
    var contrastWithBlack = (L + 0.05) / 0.05;
    return contrastWithBlack >= contrastWithWhite ? "black" : "white";
}

function contrastRatio(rgbA, rgbB) {
    var a = relativeLuminance(rgbA);
    var b = relativeLuminance(rgbB);
    var hi = a > b ? a : b;
    var lo = a > b ? b : a;
    return (hi + 0.05) / (lo + 0.05);
}

/* CIE Lab D65 -> sRGB 0-255, recortado no gamut. Inverso de rgbToLab. */
function labToRgb(lab) {
    var fy = (lab[0] + 16) / 116;
    var fx = fy + lab[1] / 500;
    var fz = fy - lab[2] / 200;

    var f = [fx, fy, fz];
    var xyz = [];
    for (var i = 0; i < 3; i++) {
        var cube = f[i] * f[i] * f[i];
        xyz[i] = cube > 0.008856451679 ? cube : (116 * f[i] - 16) / 903.2962962;
    }

    var x = xyz[0] * 0.95047;
    var y = xyz[1] * 1.00000;
    var z = xyz[2] * 1.08883;

    var lin = [
        x * 3.2404542 + y * -1.5371385 + z * -0.4985314,
        x * -0.9692660 + y * 1.8760108 + z * 0.0415560,
        x * 0.0556434 + y * -0.2040259 + z * 1.0572252
    ];

    var out = [];
    for (var j = 0; j < 3; j++) {
        var c = lin[j] <= 0.0031308
            ? 12.92 * lin[j]
            : 1.055 * Math.pow(lin[j] < 0 ? 0 : lin[j], 1 / 2.4) - 0.055;
        out[j] = clamp(c * 255, 0, 255);
    }
    return out;
}

/*
 * Cor de texto derivada da propria cor do bloco: mesma matiz, luminosidade
 * empurrada para o lado oposto ate atingir `minContrast`.
 *
 * Preto e branco puros resolvem contraste mas achatam o cartao - o rotulo fica
 * parecendo colado por cima. Manter a e b do Lab e mexer so no L da aquele
 * magenta escuro sobre rosa, oliva sobre amarelo, rosa claro sobre vinho. Se
 * nenhum L atingir o contraste pedido (acontece em cores ja muito escuras ou
 * muito claras), cai para preto ou branco, que sempre atinge.
 */
function deriveInkColor(rgb, minContrast) {
    var lab = rgbToLab(rgb);
    var goingDark = lab[0] > 50;
    var step = goingDark ? -2 : 2;

    var L = lab[0];
    for (var i = 0; i < 60; i++) {
        L += step;
        if (L < 0 || L > 100) break;
        var candidate = labToRgb([L, lab[1], lab[2]]);
        if (contrastRatio(rgb, candidate) >= minContrast) return candidate;
    }
    return goingDark ? [0, 0, 0] : [255, 255, 255];
}

/*
 * Larguras dos blocos de uma linha do bento, em colunas.
 *
 * A soma bate exatamente com `columns` por construcao, entao nao ha como
 * sobrar buraco nem estourar a linha. O deslocamento por `rowIndex` faz o bloco
 * largo andar de lugar a cada linha, que e o que da o desenho de mosaico em vez
 * de listras.
 */
function bentoRowSpans(columns, rowIndex) {
    if (columns < 1) columns = 1;
    if (columns === 1) return [1];

    var spans = [];
    var remaining = columns;
    var i = 0;
    while (remaining > 0) {
        var span = ((rowIndex + i) % 3 === 0) ? 2 : 1;
        if (span > remaining) span = remaining;
        spans.push(span);
        remaining -= span;
        i++;
    }
    return spans;
}

/* Linhas altas e normais se alternam para o mosaico nao virar uma grade. */
function bentoRowIsTall(rowIndex) {
    return rowIndex % 3 === 1;
}

function formatNumbers(values, separator) {
    var out = [];
    for (var i = 0; i < values.length; i++) out[i] = Math.round(values[i]);
    return out.join(separator == null ? ", " : separator);
}

/*
 * Estrutura do cartao, separada do desenho para poder ser testada:
 *
 *   {
 *     title: "ROSA",                 canto superior esquerdo
 *     badge: "PANTONE 231 C",        canto superior direito
 *     rows: [                        bloco inferior, rotulo | valor
 *       { label: "HEX",  value: "#FF99FF" },
 *       { label: "RGB",  value: "255, 153, 255" },
 *       { label: "CMYK", value: "0, 40, 0, 0" }
 *     ]
 *   }
 *
 * O Pantone mais proximo vai para o cabecalho; os demais, quando pantoneCount
 * for maior que 1, viram linhas do bloco. Toda linha de Pantone continua sendo
 * resultado de busca por proximidade, nunca leitura da cor - o dE ao lado
 * (showDeltaE) e o que diz o quanto ela esta longe.
 */
function buildCard(rec, cfg) {
    var title = rec.name || "";
    if (title && cfg.uppercaseName) title = title.toUpperCase();

    var badge = "";
    var rows = [];

    /*
     * O dE so entra quando acrescenta informacao. Com showDeltaE "auto" ele
     * aparece apenas nos matches fracos: o cartao fica limpo como num guia de
     * marca, e o aviso sobra para as cores em que a aproximacao de fato
     * merece conferencia num leque fisico.
     */
    function pantoneText(hit) {
        var show = cfg.showDeltaE === true ||
            (cfg.showDeltaE === "auto" && hit.deltaE > cfg.deltaEThreshold);
        return show
            ? hit.name + "  dE " + (Math.round(hit.deltaE * 10) / 10)
            : hit.name;
    }

    if (cfg.showPantone && rec.pantone && rec.pantone.length) {
        badge = pantoneText(rec.pantone[0]);
    }

    if (cfg.showHex) rows.push({ label: "HEX", value: rec.hex });
    if (cfg.showRGB) rows.push({ label: "RGB", value: formatNumbers(rec.rgb) });
    if (cfg.showCMYK) rows.push({ label: "CMYK", value: formatNumbers(rec.cmyk) });

    if (cfg.showPantone && rec.pantone) {
        for (var i = 1; i < rec.pantone.length; i++) {
            rows.push({ label: "PANTONE", value: pantoneText(rec.pantone[i]) });
        }
    }

    return { title: title, badge: badge, rows: rows };
}

/*
 * Largura de texto que o cartao precisa, em caracteres.
 *
 * Cada linha e um par rotulo/valor em colunas opostas, entao o que importa e a
 * soma dos dois mais uma folga entre eles - nao a linha mais longa. O mesmo
 * vale para titulo e badge no cabecalho.
 */
function cardTextChars(card, gapChars) {
    // Folga generosa: no cabecalho o nome e o Pantone ficam em cantos opostos e
    // encostar um no outro e o que mais estraga o cartao.
    if (gapChars == null) gapChars = 6;

    var widest = 0;
    if (card.title || card.badge) {
        widest = card.title.length + card.badge.length + gapChars;
    }
    for (var i = 0; i < card.rows.length; i++) {
        var n = card.rows[i].label.length + card.rows[i].value.length + gapChars;
        if (n > widest) widest = n;
    }
    return widest;
}

/*
 * Le uma lista de cores colada pelo usuario.
 *
 * Um codigo por linha. Aceita:
 *   #FF99FF   FF99FF   #F9F        hexadecimal
 *   255, 153, 255                  tres numeros = RGB
 *   0, 40, 0, 0                    quatro numeros = CMYK
 *   rgb(255, 153, 255)             a pontuacao e ignorada
 *   Rosa: #FF99FF                  nome antes do codigo
 *
 * Linha SEM codigo vira titulo de grupo, e as cores seguintes entram nele:
 *
 *   Principais          <- grupo
 *   Rosa: #FF99FF
 *   Amarelo: #F8F852
 *   Secundarias         <- grupo
 *   Bege: #FFD9DA
 *
 * Devolve { groups: [{name, colors: [{name, rgb} | {name, cmyk}]}], errors: [] }.
 */
function trimText(s) {
    return String(s).replace(/^[\s?]+/, "").replace(/[\s?]+$/, "");
}

function parseColorLine(line) {
    // Hexadecimal com # e o caso sem ambiguidade: tenta primeiro.
    var hexMatch = line.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    if (hexMatch) {
        return { name: trimSeparators(line.substring(0, line.indexOf(hexMatch[0]))),
                 rgb: hexToRgb(hexMatch[1]) };
    }

    // Tres numeros = RGB, quatro = CMYK. Qualquer outra quantidade nao e cor:
    // "Cores 2024" e "Grid 3 x 3" tem de continuar sendo titulo de grupo.
    var numbers = line.match(/\d+(\.\d+)?/g);
    if (numbers && (numbers.length === 3 || numbers.length === 4)) {
        var values = [];
        for (var i = 0; i < numbers.length; i++) values[i] = parseFloat(numbers[i]);
        var name = trimSeparators(line.substring(0, line.indexOf(numbers[0])));

        if (values.length === 3) {
            for (var r = 0; r < 3; r++) {
                if (values[r] < 0 || values[r] > 255) {
                    return { error: "RGB fora de 0-255" };
                }
            }
            return { name: name, rgb: values };
        }
        for (var c = 0; c < 4; c++) {
            if (values[c] < 0 || values[c] > 100) {
                return { error: "CMYK fora de 0-100" };
            }
        }
        return { name: name, cmyk: values };
    }

    // Hexadecimal sem #: so quando for o token isolado no fim da linha, para
    // nao confundir uma palavra que por acaso so tenha letras de A a F.
    var bare = line.match(/(^|\s)([0-9a-fA-F]{6})\s*$/);
    if (bare) {
        return { name: trimSeparators(line.substring(0, line.lastIndexOf(bare[2]))),
                 rgb: hexToRgb(bare[2]) };
    }

    return null;
}

function trimSeparators(s) {
    return trimText(String(s).replace(/[:\---|=,]+\s*$/, ""));
}

function hexToRgb(hex) {
    if (hex.length === 3) {
        hex = hex.charAt(0) + hex.charAt(0) +
              hex.charAt(1) + hex.charAt(1) +
              hex.charAt(2) + hex.charAt(2);
    }
    return [
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16)
    ];
}

function parseColorInput(text) {
    var lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var groups = [];
    var errors = [];
    var current = null;

    for (var i = 0; i < lines.length; i++) {
        var line = trimText(lines[i]).replace(/^[-**]\s+/, "");
        if (!line) continue;

        var parsed = parseColorLine(line);

        if (!parsed) {
            // Titulo de grupo. Tira enfeites tipo "## Principais ##" e "-- x --".
            var name = trimText(line.replace(/^[#=\---\s]+/, "").replace(/[#=\---:\s]+$/, ""));
            current = { name: name, colors: [] };
            groups.push(current);
            continue;
        }

        if (parsed.error) {
            errors.push("linha " + (i + 1) + ": " + parsed.error + " (" + line + ")");
            continue;
        }

        if (!current) {
            current = { name: "", colors: [] };
            groups.push(current);
        }
        current.colors.push(parsed);
    }

    // Grupo declarado e nunca preenchido nao deve virar titulo solto.
    var kept = [];
    for (var g = 0; g < groups.length; g++) {
        if (groups[g].colors.length) kept.push(groups[g]);
    }

    return { groups: kept, errors: errors };
}

/* Versao em texto corrido, usada pelo layout em grade. */
function cardToLines(card) {
    var lines = [];
    if (card.title) lines.push(card.title);
    if (card.badge) lines.push(card.badge);
    for (var i = 0; i < card.rows.length; i++) {
        lines.push(card.rows[i].label + " " + card.rows[i].value);
    }
    return lines;
}

function buildLabel(rec, cfg) {
    var card = buildCard(rec, cfg);
    if (!cfg.showName) card.title = "";
    return cardToLines(card).join("\r");
}

// ============================================================================
// Ponte com o Illustrator
// ============================================================================

function convert(sourceSpace, components, targetSpace) {
    try {
        return app.convertSampleColor(
            sourceSpace, components, targetSpace, ColorConvertPurpose.previewpurpose
        );
    } catch (e) {
        return null;
    }
}

/*
 * Reduz qualquer cor do Illustrator a {rgb, cmyk, spotName}.
 * Devolve null para gradientes, padroes e NoColor.
 */
function normalizeColor(color) {
    if (!color || !color.typename) return null;

    var rgb = null, cmyk = null, spotName = null;

    if (color.typename === "SpotColor") {
        try { spotName = color.spot.name; } catch (e) {}
        var inner = null;
        try { inner = color.spot.color; } catch (e) {}
        if (!inner) return null;

        var t = 100;
        try { if (color.tint != null) t = color.tint; } catch (e) {}

        var base = normalizeColor(inner);
        if (!base) return null;
        base.spotName = spotName;

        // Tinta: mistura em direcao ao branco do papel.
        if (t < 100) {
            var f = t / 100;
            for (var i = 0; i < 3; i++) base.rgb[i] = 255 - (255 - base.rgb[i]) * f;
            for (var j = 0; j < 4; j++) base.cmyk[j] = base.cmyk[j] * f;
        }
        return base;
    }

    if (color.typename === "RGBColor") {
        rgb = [color.red, color.green, color.blue];
        cmyk = convert(ImageColorSpace.RGB, rgb, ImageColorSpace.CMYK) || rgbToCmykNaive(rgb);
    } else if (color.typename === "CMYKColor") {
        cmyk = [color.cyan, color.magenta, color.yellow, color.black];
        rgb = convert(ImageColorSpace.CMYK, cmyk, ImageColorSpace.RGB) || cmykToRgbNaive(cmyk);
    } else if (color.typename === "GrayColor") {
        var v = 255 * (1 - clamp(color.gray, 0, 100) / 100);
        rgb = [v, v, v];
        cmyk = convert(ImageColorSpace.GrayScale, [color.gray], ImageColorSpace.CMYK)
            || [0, 0, 0, color.gray];
    } else if (color.typename === "LabColor") {
        var lab = [color.l, color.a, color.b];
        rgb = convert(ImageColorSpace.LAB, lab, ImageColorSpace.RGB);
        if (!rgb) return null;
        cmyk = convert(ImageColorSpace.LAB, lab, ImageColorSpace.CMYK) || rgbToCmykNaive(rgb);
    } else {
        return null; // GradientColor, PatternColor, NoColor
    }

    return { rgb: rgb, cmyk: cmyk, spotName: spotName };
}

function collectFromItems(items, sink) {
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var type = item.typename;

        if (type === "GroupItem") {
            collectFromItems(item.pageItems, sink);
            continue;
        }
        if (type === "CompoundPathItem") {
            collectFromItems(item.pathItems, sink);
            continue;
        }
        if (type === "TextFrame") {
            try {
                var chars = item.textRange.characterAttributes;
                sink.push({ color: chars.fillColor, name: null });
            } catch (e) {}
            continue;
        }
        if (type === "PluginItem") {
            // Objetos vivos (blend, envelope, ...): tenta os filhos expandidos.
            try { collectFromItems(item.pageItems, sink); } catch (e) {}
            continue;
        }

        try {
            if (item.filled) sink.push({ color: item.fillColor, name: null });
        } catch (e) {}
        try {
            if (CONFIG.includeStrokes && item.stroked) sink.push({ color: item.strokeColor, name: null });
        } catch (e) {}
    }
}

/*
 * Lista de cores embutida no proprio arquivo.
 *
 * Vazia, o script abre a caixa para colar (source "input"). Preenchida, ele
 * usa ela direto e nao pergunta nada - e assim que o arquivo gerado pela skill
 * roda com um duplo clique, sem ninguem redigitar a paleta.
 *
 * Mesmo formato da caixa; ver parseColorInput. Exemplo:
 *
 *   var EMBEDDED_COLORS = "Principais\rRosa: 255, 153, 255\rAmarelo: #F8F852";
 */
var EMBEDDED_COLORS = "";

function hasEmbeddedColors() {
    return EMBEDDED_COLORS && trimText(EMBEDDED_COLORS).length > 0;
}

/*
 * Caixa para colar a lista de cores. Devolve o texto, ou null se cancelado.
 *
 * Fica de fora dos testes: ScriptUI so existe dentro do Illustrator. Toda a
 * logica esta em parseColorInput, que e pura e testada.
 */
function promptForColors() {
    var dialog = new Window("dialog", "Legenda de cores");
    dialog.orientation = "column";
    dialog.alignChildren = "fill";
    dialog.spacing = 10;
    dialog.margins = 16;

    var help = dialog.add("statictext", undefined,
        "Cole os codigos, um por linha:\n" +
        "\n" +
        "   Principais\n" +
        "   Rosa: 255, 153, 255\n" +
        "   Amarelo: #F8F852\n" +
        "   Secundarias\n" +
        "   Bege: 255, 217, 218\n" +
        "\n" +
        "Aceita HEX, tres numeros (RGB) ou quatro (CMYK). Linha sem codigo\n" +
        "vira titulo de grupo. O nome antes do codigo e opcional.",
        { multiline: true });
    help.characters = 62;

    var input = dialog.add("edittext", undefined, "", { multiline: true, scrolling: true });
    input.preferredSize = [440, 260];
    input.active = true;

    var buttons = dialog.add("group");
    buttons.alignment = "right";
    buttons.add("button", undefined, "Cancelar", { name: "cancel" });
    buttons.add("button", undefined, "Gerar", { name: "ok" });

    return dialog.show() === 1 ? input.text : null;
}

function collectFromInput(text, sink) {
    var parsed = parseColorInput(text);

    for (var g = 0; g < parsed.groups.length; g++) {
        var group = parsed.groups[g];
        for (var c = 0; c < group.colors.length; c++) {
            var color = group.colors[c];
            sink.push({
                color: null,
                name: color.name || null,
                group: group.name,
                rgb: color.rgb || null,
                cmyk: color.cmyk || null
            });
        }
    }
    return parsed.errors;
}

function collectFromSwatches(doc, sink) {
    var swatches = null;
    try { swatches = doc.swatches.getSelected(); } catch (e) {}
    if (!swatches || !swatches.length) swatches = doc.swatches;

    for (var i = 0; i < swatches.length; i++) {
        sink.push({ color: swatches[i].color, name: swatches[i].name });
    }
}

function buildRecords(raw) {
    var records = [];
    var seen = {};
    var skipped = 0;

    for (var i = 0; i < raw.length; i++) {
        var norm;

        if (raw[i].rgb || raw[i].cmyk) {
            // Veio da lista colada: ja e um par de valores, nao um objeto de
            // cor do Illustrator. A conversao entre os dois espacos usa o
            // perfil do documento, igual ao resto.
            var inRgb = raw[i].rgb;
            var inCmyk = raw[i].cmyk;
            if (!inRgb) {
                inRgb = convert(ImageColorSpace.CMYK, inCmyk, ImageColorSpace.RGB)
                    || cmykToRgbNaive(inCmyk);
            }
            if (!inCmyk) {
                inCmyk = convert(ImageColorSpace.RGB, inRgb, ImageColorSpace.CMYK)
                    || rgbToCmykNaive(inRgb);
            }
            norm = { rgb: inRgb, cmyk: inCmyk, spotName: null };
        } else {
            norm = normalizeColor(raw[i].color);
        }

        if (!norm) {
            skipped++;
            continue;
        }

        var hex = toHex(norm.rgb);
        var name = norm.spotName || raw[i].name || null;
        var group = raw[i].group || "";
        var key = group + "/" + hex + "/" + (name || "");
        if (seen[key]) continue;
        seen[key] = true;

        records.push({
            group: group,
            name: name,
            hex: hex,
            rgb: norm.rgb,
            cmyk: norm.cmyk,
            pantone: CONFIG.showPantone ? nearestPantone(norm.rgb, CONFIG.pantoneCount) : null
        });
    }

    return { records: records, skipped: skipped };
}

function makeFlatColor(doc, rgb, cmyk) {
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
        var c = new CMYKColor();
        c.cyan = cmyk[0]; c.magenta = cmyk[1]; c.yellow = cmyk[2]; c.black = cmyk[3];
        return c;
    }
    var r = new RGBColor();
    r.red = rgb[0]; r.green = rgb[1]; r.blue = rgb[2];
    return r;
}

function makeBlack(doc) {
    return makeFlatColor(doc, [0, 0, 0], [0, 0, 0, 100]);
}

function makeWhite(doc) {
    return makeFlatColor(doc, [255, 255, 255], [0, 0, 0, 0]);
}

function countLines(text) {
    var n = 1;
    for (var i = 0; i < text.length; i++) if (text.charAt(i) === "\r") n++;
    return n;
}

function longestLineLength(text) {
    var longest = 0;
    var current = 0;
    for (var i = 0; i < text.length; i++) {
        if (text.charAt(i) === "\r") {
            if (current > longest) longest = current;
            current = 0;
        } else {
            current++;
        }
    }
    return current > longest ? current : longest;
}

/*
 * Corpo de texto que faz o rotulo caber em `maxWidth`.
 *
 * A largura e estimada por contagem de caracteres, nao medida: ler
 * TextFrame.width obrigaria a criar o texto, medir e reposicionar, e a
 * ancoragem de pointText muda de semantica no meio disso. O fator 0.55 em e
 * uma media larga para as sem-serifa usadas em legenda - erra para o lado de
 * encolher demais, que e o lado seguro.
 *
 * "PANTONE Neutral Black C  dE 2.5" tem 31 caracteres: a 9 pt pede ~153 pt de
 * largura e nao cabe num bloco de 110. Sem isto o texto vaza por cima do bloco
 * vizinho.
 *
 * Recebe a contagem de caracteres, nao o texto: no cartao o que ocupa a linha e
 * a soma do rotulo com o valor em colunas opostas, nao a maior string.
 */
/*
 * Largura de coluna que faz o rotulo mais longo do conjunto caber no corpo
 * base, dentro de [minWidth, maxWidth].
 *
 * Encolher a fonte por bloco resolve o transbordo mas entrega uma legenda
 * desigual: os blocos de 2 colunas ficam com 9 pt e os de 1 coluna com 6 pt,
 * lado a lado. Alargar a coluna mantem um corpo unico para tudo. A conta e
 * feita para UMA coluna, entao os blocos largos sobram espaco - e o lado certo
 * de errar.
 */
function autoUnitWidth(charCounts, baseSize, pad, minWidth, maxWidth) {
    var longest = 0;
    for (var i = 0; i < charCounts.length; i++) {
        if (charCounts[i] > longest) longest = charCounts[i];
    }
    if (longest === 0) return minWidth;

    var needed = longest * baseSize * 0.55 + pad * 2;
    if (needed < minWidth) return minWidth;
    if (needed > maxWidth) return maxWidth;
    return Math.ceil(needed);
}

function fitTextSize(chars, maxWidth, baseSize, minSize) {
    if (chars <= 0 || maxWidth <= 0) return baseSize;

    var fitted = maxWidth / (chars * 0.55);
    if (fitted >= baseSize) return baseSize;
    if (fitted < minSize) return minSize;
    return Math.floor(fitted * 10) / 10;
}

/*
 * Calcula onde cada cartao vai, sem desenhar nada.
 *
 * Coordenadas com origem em (0,0) no canto superior esquerdo e y crescendo para
 * BAIXO - a conversao para o sistema do Illustrator, que cresce para cima,
 * acontece so na hora de desenhar. Isso mantem a funcao pura e testavel, e e
 * necessario tambem para saber o tamanho total antes de desenhar o painel de
 * fundo, que precisa ficar atras de tudo.
 *
 * `cards` sao as estruturas de buildCard; `unitW` a largura de uma coluna.
 */
function planBento(sections, unitW, cfg) {
    var pad = cfg.bentoPadding;
    var tiles = [];
    var headings = [];
    var y = 0;
    var rowIndex = 0;
    var maxRight = 0;

    for (var g = 0; g < sections.length; g++) {
        var section = sections[g];
        if (!section.cards.length) continue;

        if (g > 0) y += cfg.groupGapY;

        if (section.name) {
            // y aqui e o TOPO da caixa do titulo; o desenho converte para a
            // linha de base.
            headings.push({ text: section.name, x: 0, y: y, size: cfg.groupHeadingSize });
            y += cfg.groupHeadingSize * 1.3 + cfg.groupHeadingGap;
        }

        var index = 0;
        while (index < section.cards.length) {
            var spans = cfg.bentoMosaic ? bentoRowSpans(cfg.columns, rowIndex) : null;

            // Mede a linha inteira antes de posicionar: os cartoes precisam da
            // mesma altura, que e a do conteudo mais alto entre eles.
            var rowTiles = [];
            var needed = 0;
            for (var s = 0; s < cfg.columns && index + s < section.cards.length; s++) {
                var span = spans ? spans[s] : 1;
                if (span == null) break;

                var w = unitW * span + cfg.gapX * (span - 1);
                var entry = section.cards[index + s];
                var size = fitTextSize(cardTextChars(entry.card), w - pad * 2,
                                       cfg.textSize, cfg.minTextSize);
                var lead = size * cfg.bentoLineSpacing;

                // cabecalho + linhas de valor, tudo entre os paddings
                var headerH = (entry.card.title || entry.card.badge) ? lead : 0;
                var contentH = headerH + entry.card.rows.length * lead + pad * 2;

                rowTiles.push({ index: entry.index, w: w, size: size });
                if (contentH > needed) needed = contentH;

                if (spans && s + 1 >= spans.length) break;
            }
            if (!rowTiles.length) break;

            // Se a coluna teve de alargar, a altura acompanha para o cartao
            // manter a proporcao; senao ele viraria uma faixa achatada.
            var baseH = cfg.swatchH * (unitW / cfg.swatchW);
            var nominal = baseH *
                ((cfg.bentoMosaic && bentoRowIsTall(rowIndex)) ? cfg.bentoTallFactor : 1);
            var rowH = nominal > needed ? nominal : needed;

            var x = 0;
            for (var t = 0; t < rowTiles.length; t++) {
                rowTiles[t].x = x;
                rowTiles[t].y = y;
                rowTiles[t].h = rowH;
                tiles.push(rowTiles[t]);
                x += rowTiles[t].w + cfg.gapX;
            }
            if (x - cfg.gapX > maxRight) maxRight = x - cfg.gapX;

            index += rowTiles.length;
            y += rowH + cfg.gapY;
            rowIndex++;
        }
    }

    return {
        tiles: tiles,
        headings: headings,
        width: maxRight,
        height: y > 0 ? y - cfg.gapY : 0
    };
}

/*
 * Junta os registros em secoes na ordem em que os grupos aparecem. Registro sem
 * grupo cai numa secao unica sem titulo, que e o caso de quem le do documento.
 */
function groupRecords(records, cards) {
    var sections = [];
    var byName = {};

    for (var i = 0; i < records.length; i++) {
        var name = records[i].group || "";
        var key = "g:" + name;
        if (!byName[key]) {
            byName[key] = { name: name, cards: [] };
            sections.push(byName[key]);
        }
        byName[key].cards.push({ index: i, card: cards[i] });
    }
    return sections;
}

/*
 * Largura de coluna do bento.
 *
 * A grade regular e o que faz a prancheta ler como sistema, entao a largura
 * configurada manda: um nome comprido encolhe o texto, nao deforma a coluna.
 * O cartao so alarga quando nem o corpo minimo caberia - ai a alternativa
 * seria texto ilegivel, que e pior.
 *
 * E a prioridade inversa da que valia antes, quando um unico nome longo
 * inflava a legenda inteira.
 */
function bentoUnitWidth(charCounts, cfg) {
    if (!cfg.autoWidth) return cfg.swatchW;

    var longest = 0;
    for (var i = 0; i < charCounts.length; i++) {
        if (charCounts[i] > longest) longest = charCounts[i];
    }
    if (longest === 0) return cfg.swatchW;

    // Cabe no cartao configurado, mesmo que com texto menor? Entao fica.
    var atConfigured = fitTextSize(longest, cfg.swatchW - cfg.bentoPadding * 2,
                                   cfg.textSize, 0);
    if (atConfigured >= cfg.minTextSize) return cfg.swatchW;

    // Nao cabe nem no corpo minimo: alarga ate caber, dentro do teto.
    return autoUnitWidth([longest], cfg.minTextSize, cfg.bentoPadding,
                         cfg.swatchW, cfg.maxSwatchW);
}

/* Contexto de desenho compartilhado pelos dois layouts. */
function makeCanvas(doc) {
    var layer;
    try {
        layer = doc.layers.getByName(CONFIG.layerName);
    } catch (e) {
        layer = doc.layers.add();
        layer.name = CONFIG.layerName;
    }
    layer.locked = false;
    layer.visible = true;

    var board = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var font = null;
    if (CONFIG.fontName) {
        try { font = app.textFonts.getByName(CONFIG.fontName); } catch (e) {}
    }

    var group = layer.groupItems.add();
    group.name = "Color Codes";

    return {
        doc: doc,
        group: group,
        originX: board[0] + 20,
        originY: board[1] - 20,
        black: makeBlack(doc),
        white: makeWhite(doc),
        font: font,
        lineHeight: CONFIG.textSize * 1.3
    };
}

/*
 * Retangulo com cantos arredondados, caindo para o reto se a versao do
 * Illustrator nao tiver roundedRectangle ou se o raio for zero.
 */
function addRect(container, top, left, w, h, radius) {
    if (radius > 0) {
        try {
            return container.pathItems.roundedRectangle(top, left, w, h, radius, radius, false);
        } catch (e) {}
    }
    return container.pathItems.rectangle(top, left, w, h);
}

function drawTile(canvas, rec, x, y, w, h) {
    var card = canvas.group.groupItems.add();
    card.name = rec.name || rec.hex;

    var rect = addRect(card, y, x, w, h, CONFIG.cornerRadius);
    rect.filled = true;
    rect.stroked = false;
    // Pinta com a cor reconstruida, para bater com os valores exibidos.
    rect.fillColor = makeFlatColor(canvas.doc, rec.rgb, rec.cmyk);

    return card;
}

/*
 * `align` e "left" ou "right". Em pointText a justificacao a direita ancora o
 * texto NO ponto, entao passar a borda direita do cartao ja alinha a coluna de
 * valores sem precisar medir string nenhuma.
 */
function drawText(canvas, card, label, x, baselineY, color, size, align, spacing) {
    var text = card.textFrames.pointText([x, baselineY]);
    text.contents = label;
    try {
        text.textRange.characterAttributes.size = size;
        text.textRange.characterAttributes.leading = size * (spacing || 1.3);
        text.textRange.characterAttributes.fillColor = color;
        if (canvas.font) text.textRange.characterAttributes.textFont = canvas.font;
    } catch (e) {}
    if (align === "right") {
        try {
            text.paragraphs[0].paragraphAttributes.justification = Justification.RIGHT;
        } catch (e) {}
    }
    return text;
}

function drawBackdrop(canvas, left, top, w, h, rgb, radius) {
    if (!rgb) return null;
    var rect = addRect(canvas.group, top, left, w, h, radius);
    rect.filled = true;
    rect.stroked = false;
    rect.fillColor = makeFlatColor(canvas.doc, rgb, rgbToCmykNaive(rgb));
    return rect;
}

/*
 * Grade uniforme: amostra em cima, rotulo em preto embaixo.
 *
 * A altura de linha e uma so, calculada pelo rotulo mais alto do conjunto. Ela
 * precisa ser uniforme porque a posicao de cada item e o indice da linha vezes
 * a altura - usar a altura do proprio item desalinharia tudo assim que dois
 * rotulos tivessem numeros de linhas diferentes.
 */
function drawGrid(canvas, records) {
    var labels = [];
    var chars = [];
    for (var m = 0; m < records.length; m++) {
        labels[m] = buildLabel(records[m], CONFIG);
        chars[m] = longestLineLength(labels[m]);
    }

    // No grid o rotulo fica fora da amostra, entao pode usar tambem o respiro
    // ate a coluna seguinte.
    var unitW = CONFIG.autoWidth
        ? autoUnitWidth(chars, CONFIG.textSize, 0, CONFIG.swatchW, CONFIG.maxSwatchW) - CONFIG.gapX
        : CONFIG.swatchW;
    if (unitW < CONFIG.swatchW) unitW = CONFIG.swatchW;
    var textWidth = unitW + CONFIG.gapX;

    var sizes = [];
    var tallest = 0;
    for (var n = 0; n < records.length; n++) {
        sizes[n] = fitTextSize(chars[n], textWidth, CONFIG.textSize, CONFIG.minTextSize);
        var h = countLines(labels[n]) * sizes[n] * CONFIG.gridLineSpacing;
        if (h > tallest) tallest = h;
    }
    var rowH = CONFIG.swatchH + tallest + CONFIG.gapY;

    // Os grupos vindos da lista colada valem aqui tambem: cada um comeca numa
    // linha nova, com o titulo acima.
    var cardsForGrouping = [];
    for (var k = 0; k < records.length; k++) cardsForGrouping[k] = null;
    var sections = groupRecords(records, cardsForGrouping);

    var y = canvas.originY;
    for (var g = 0; g < sections.length; g++) {
        if (g > 0) y -= CONFIG.groupGapY;

        if (sections[g].name) {
            var heading = CONFIG.uppercaseGroup
                ? sections[g].name.toUpperCase()
                : sections[g].name;
            drawText(canvas, canvas.group, heading, canvas.originX,
                     y - CONFIG.groupHeadingSize, canvas.black,
                     CONFIG.groupHeadingSize, "left");
            y -= CONFIG.groupHeadingSize * 1.3 + CONFIG.groupHeadingGap;
        }

        for (var c = 0; c < sections[g].cards.length; c++) {
            var idx = sections[g].cards[c].index;
            var x = canvas.originX + (c % CONFIG.columns) * (unitW + CONFIG.gapX);
            var cardY = y - Math.floor(c / CONFIG.columns) * rowH;

            var card = drawTile(canvas, records[idx], x, cardY, unitW, CONFIG.swatchH);
            drawText(canvas, card, labels[idx], x,
                     cardY - CONFIG.swatchH - sizes[idx] - 4,
                     canvas.black, sizes[idx], "left", CONFIG.gridLineSpacing);
        }
        y -= Math.ceil(sections[g].cards.length / CONFIG.columns) * rowH;
    }
}

/*
 * Bento: cartoes de cantos arredondados sobre um painel.
 *
 * Cada cartao traz o nome no canto superior esquerdo, o Pantone no superior
 * direito, e os valores no rodape em duas colunas - rotulo a esquerda, valor
 * alinhado a direita. O texto usa uma cor derivada da propria cor do cartao
 * (mesma matiz, luminosidade oposta), nao preto ou branco chapado.
 */
function drawBento(canvas, records) {
    var pad = CONFIG.bentoPadding;

    var cards = [];
    var chars = [];
    for (var m = 0; m < records.length; m++) {
        cards[m] = buildCard(records[m], CONFIG);
        if (!CONFIG.showName) cards[m].title = "";
        chars[m] = cardTextChars(cards[m]);
    }

    var unitW = bentoUnitWidth(chars, CONFIG);

    var plan = planBento(groupRecords(records, cards), unitW, CONFIG);

    // O fundo e o painel entram primeiro: no Illustrator o que e criado depois
    // fica por cima, entao desenhar os cartoes em seguida os deixa na frente.
    var panelPad = CONFIG.panelColor ? CONFIG.panelPadding : 0;
    var bgPad = panelPad + (CONFIG.backgroundColor ? CONFIG.backgroundPadding : 0);

    drawBackdrop(canvas,
        canvas.originX - bgPad, canvas.originY + bgPad,
        plan.width + bgPad * 2, plan.height + bgPad * 2,
        CONFIG.backgroundColor, CONFIG.panelRadius + CONFIG.backgroundPadding);

    drawBackdrop(canvas,
        canvas.originX - panelPad, canvas.originY + panelPad,
        plan.width + panelPad * 2, plan.height + panelPad * 2,
        CONFIG.panelColor, CONFIG.panelRadius);

    for (var hd = 0; hd < plan.headings.length; hd++) {
        var head = plan.headings[hd];
        var text = CONFIG.uppercaseGroup ? head.text.toUpperCase() : head.text;
        drawText(canvas, canvas.group, text,
                 canvas.originX + head.x, canvas.originY - head.y - head.size,
                 canvas.black, head.size, "left");
    }

    for (var t = 0; t < plan.tiles.length; t++) {
        var tile = plan.tiles[t];
        var rec = records[tile.index];
        var card = cards[tile.index];

        // y do plano cresce para baixo; o do Illustrator, para cima.
        var x = canvas.originX + tile.x;
        var y = canvas.originY - tile.y;

        var group = drawTile(canvas, rec, x, y, tile.w, tile.h);

        var inkRgb = deriveInkColor(rec.rgb, CONFIG.minInkContrast);
        var ink = makeFlatColor(canvas.doc, inkRgb, rgbToCmykNaive(inkRgb));

        var lead = tile.size * CONFIG.bentoLineSpacing;
        var leftX = x + pad;
        var rightX = x + tile.w - pad;

        if (card.title || card.badge) {
            var headBaseline = y - pad - tile.size;
            if (card.title) {
                drawText(canvas, group, card.title, leftX, headBaseline, ink, tile.size, "left");
            }
            if (card.badge) {
                drawText(canvas, group, card.badge, rightX, headBaseline, ink, tile.size, "right");
            }
        }

        if (card.rows.length) {
            // pointText ancora na base da PRIMEIRA linha e as seguintes descem;
            // para encostar o bloco no rodape, sobe (n-1) entrelinhas.
            var bodyBaseline = (y - tile.h) + pad + (card.rows.length - 1) * lead;
            var labels = [];
            var values = [];
            for (var r = 0; r < card.rows.length; r++) {
                labels.push(card.rows[r].label);
                values.push(card.rows[r].value);
            }
            drawText(canvas, group, labels.join("\r"), leftX, bodyBaseline,
                     ink, tile.size, "left", CONFIG.bentoLineSpacing);
            drawText(canvas, group, values.join("\r"), rightX, bodyBaseline,
                     ink, tile.size, "right", CONFIG.bentoLineSpacing);
        }
    }
}

function draw(doc, records) {
    var canvas = makeCanvas(doc);
    if (CONFIG.layout === "bento") {
        drawBento(canvas, records);
    } else {
        drawGrid(canvas, records);
    }
    return canvas.group;
}

function main() {
    if (app.documents.length === 0) {
        alert("Abra um documento primeiro.");
        return;
    }

    var doc = app.activeDocument;
    var raw = [];
    var inputErrors = [];
    var mode = CONFIG.source;

    if (mode === "auto") {
        mode = (doc.selection && doc.selection.length > 0) ? "selection" : "swatches";
    }

    if (mode === "input") {
        // Lista embutida tem prioridade sobre a caixa: e assim que o arquivo
        // gerado pela skill roda direto, sem ninguem digitar nada.
        var text = hasEmbeddedColors() ? EMBEDDED_COLORS : promptForColors();
        if (text === null) return; // cancelado
        inputErrors = collectFromInput(text, raw);
        if (raw.length === 0) {
            var why = "Nenhum codigo de cor reconhecido no que foi colado.";
            if (inputErrors.length) why += "\n\n" + inputErrors.join("\n");
            alert(why);
            return;
        }
    } else if (mode === "selection") {
        if (!doc.selection || doc.selection.length === 0) {
            alert("Nada selecionado.");
            return;
        }
        collectFromItems(doc.selection, raw);
    } else {
        collectFromSwatches(doc, raw);
    }

    if (raw.length === 0) {
        alert("Nenhuma cor encontrada.");
        return;
    }

    var built = buildRecords(raw);
    if (built.records.length === 0) {
        alert("Nenhuma cor solida encontrada (gradientes e padroes sao ignorados).");
        return;
    }

    var group = draw(doc, built.records);
    app.redraw();

    var msg = built.records.length + " cor(es) na legenda.";
    if (built.skipped > 0) {
        msg += "\n" + built.skipped + " item(ns) ignorado(s): gradiente, padrao ou sem preenchimento.";
    }
    if (inputErrors.length) {
        msg += "\n\n" + inputErrors.length + " linha(s) nao entendida(s):\n" + inputErrors.join("\n");
    }
    alert(msg);
}

// So executa dentro do Illustrator; em Node o arquivo pode ser carregado
// para testar as funcoes de cor.
if (typeof app !== "undefined" && app.documents) {
    main();
}
