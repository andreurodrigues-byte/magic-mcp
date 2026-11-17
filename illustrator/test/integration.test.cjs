/*
 * Executa ColorCodesLegend.jsx contra um DOM do Illustrator simulado.
 *
 * Nao substitui rodar no Illustrator de verdade — um stub nao valida o
 * contrato da API da Adobe. O que ele pega e o resto: erro de digitacao,
 * propriedade inexistente, laco quebrado, gradiente nao ignorado, spot color
 * mal tratada, contagem errada de amostras. Ou seja, todo o caminho de
 * execucao entre "ler a selecao" e "desenhar a legenda".
 *
 *   node illustrator/test/integration.test.cjs
 */

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var source = fs.readFileSync(path.join(__dirname, "..", "ColorCodesLegend.jsx"), "utf8");

// Instancia isolada so para consultar pickTextColor sem rodar o script.
var probeBox = {};
vm.createContext(probeBox);
vm.runInContext(source, probeBox);
function sandboxPick(rgbTriplet) {
    return probeBox.pickTextColor(rgbTriplet);
}

// Lidos do proprio CONFIG: o teste confere a coerencia do desenho, nao
// decora os numeros do layout.
var GAP_X = Number(/\n\s*gapX:\s*([\d.]+)/.exec(source)[1]);

var failures = 0;
var checks = 0;

function ok(label, condition, detail) {
    checks++;
    if (condition) return;
    failures++;
    console.log("  FALHOU  " + label + (detail ? "  ->  " + detail : ""));
}

// ---------------------------------------------------------------------------
// Stubs do DOM
// ---------------------------------------------------------------------------

function cmyk(c, m, y, k) {
    return { typename: "CMYKColor", cyan: c, magenta: m, yellow: y, black: k };
}
function rgb(r, g, b) {
    return { typename: "RGBColor", red: r, green: g, blue: b };
}
function gray(v) {
    return { typename: "GrayColor", gray: v };
}
function spot(name, inner, tint) {
    return {
        typename: "SpotColor",
        tint: tint == null ? 100 : tint,
        spot: { name: name, color: inner }
    };
}

function makeContainer() {
    var node = {
        typename: "GroupItem",
        name: "",
        pageItems: [],
        pathItems: {
            items: [],
            roundedRectangle: function (top, left, w, h, rx, ry) {
        var r = this.rectangle(top, left, w, h);
        r.radius = rx;
        return r;
      },
      rectangle: function (top, left, w, h) {
                var r = {
                    typename: "PathItem",
                    top: top, left: left, width: w, height: h,
                    filled: false, stroked: false, fillColor: null, strokeColor: null
                };
                this.items.push(r);
                node.pageItems.push(r);
                return r;
            }
        },
        textFrames: {
            items: [],
            pointText: function (pos) {
                var t = {
                    typename: "TextFrame",
                    position: pos,
                    contents: "",
                    textRange: { characterAttributes: {} },
                    paragraphs: [{ paragraphAttributes: {} }]
                };
                this.items.push(t);
                node.pageItems.push(t);
                return t;
            }
        },
        groupItems: {
            items: [],
            add: function () {
                var g = makeContainer();
                this.items.push(g);
                node.pageItems.push(g);
                return g;
            }
        }
    };
    return node;
}

function makeDoc(colorSpace, swatches) {
    var doc = makeContainer();
    doc.documentColorSpace = colorSpace;
    doc.selection = [];
    doc.width = 1000;
    doc.artboards = [{ artboardRect: [0, 800, 600, 0] }];
    doc.artboards.getActiveArtboardIndex = function () { return 0; };

    doc.swatches = swatches || [];
    doc.swatches.getSelected = function () { return []; };

    var layers = [];
    doc.layers = layers;
    doc.layers.add = function () {
        var l = makeContainer();
        l.locked = false;
        l.visible = true;
        layers.push(l);
        return l;
    };
    doc.layers.getByName = function (n) {
        for (var i = 0; i < layers.length; i++) if (layers[i].name === n) return layers[i];
        throw new Error("no such layer: " + n);
    };
    return doc;
}

var alerts = [];
var pastedText = null;   // o que o "usuario" digita na caixa; null = cancelou
var dialogShown = 0;

function makeSandbox(doc) {
    var box = {
        alert: function (m) { alerts.push(String(m)); },
        // ScriptUI de mentira: registra que a caixa abriu e devolve o texto
        // preparado pelo teste. So o suficiente para exercitar promptForColors.
        Window: function () {
            var input = { text: "", preferredSize: null, active: false };
            return {
                orientation: "", alignChildren: "", spacing: 0, margins: 0,
                add: function (kind) {
                    if (kind === "edittext") return input;
                    if (kind === "group") {
                        return { alignment: "", add: function () { return {}; } };
                    }
                    return { characters: 0 };
                },
                show: function () {
                    dialogShown++;
                    if (pastedText === null) return 2;
                    input.text = pastedText;
                    return 1;
                }
            };
        },
        DocumentColorSpace: { CMYK: "cmyk-doc", RGB: "rgb-doc" },
        ImageColorSpace: { RGB: "rgb", CMYK: "cmyk", GrayScale: "gray", LAB: "lab" },
        ColorConvertPurpose: { previewpurpose: "preview", defaultpurpose: "default" },
        Justification: { LEFT: "left", RIGHT: "right", CENTER: "center" },
        CMYKColor: function () {
            this.typename = "CMYKColor";
            this.cyan = 0; this.magenta = 0; this.yellow = 0; this.black = 0;
        },
        RGBColor: function () {
            this.typename = "RGBColor";
            this.red = 0; this.green = 0; this.blue = 0;
        },
        GrayColor: function () { this.typename = "GrayColor"; this.gray = 0; },
        app: {
            documents: [doc],
            activeDocument: doc,
            redraw: function () {},
            textFonts: {
                getByName: function (n) { throw new Error("font not found: " + n); }
            },
            // Conversao de brinquedo: so precisa ser deterministica e plausivel.
            convertSampleColor: function (from, comps, to) {
                var r, g, b;
                if (from === "rgb") {
                    r = comps[0]; g = comps[1]; b = comps[2];
                } else if (from === "cmyk") {
                    r = 255 * (1 - comps[0] / 100) * (1 - comps[3] / 100);
                    g = 255 * (1 - comps[1] / 100) * (1 - comps[3] / 100);
                    b = 255 * (1 - comps[2] / 100) * (1 - comps[3] / 100);
                } else if (from === "gray") {
                    r = g = b = 255 * (1 - comps[0] / 100);
                } else {
                    r = g = b = 128;
                }
                if (to === "rgb") return [r, g, b];
                if (to === "cmyk") {
                    var k = 1 - Math.max(r, g, b) / 255;
                    if (k >= 1) return [0, 0, 0, 100];
                    return [
                        (1 - r / 255 - k) / (1 - k) * 100,
                        (1 - g / 255 - k) / (1 - k) * 100,
                        (1 - b / 255 - k) / (1 - k) * 100,
                        k * 100
                    ];
                }
                return [r, g, b];
            }
        }
    };
    vm.createContext(box);
    return box;
}

/*
 * A fonte padrao do script e "input" (caixa para colar codigos). Os testes que
 * exercitam leitura do documento rodam com "auto".
 */
function run(doc) {
    return runWith(doc, { source: '"auto"' });
}

function runPasted(doc, text) {
    pastedText = text;
    dialogShown = 0;
    return runWith(doc, {});
}

function legendOf(doc) {
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === "Color Codes") return doc.layers[i];
    }
    return null;
}

function cardsOf(doc) {
    var layer = legendOf(doc);
    if (!layer || !layer.groupItems.items.length) return [];
    return layer.groupItems.items[0].groupItems.items;
}

/*
 * O cartao do bento tem ate quatro quadros de texto (titulo, badge, coluna de
 * rotulos, coluna de valores), entao o "rotulo" de um cartao e a juncao de
 * todos eles. No grid e um quadro so.
 */
function labelsOf(doc) {
    var cards = cardsOf(doc);
    var out = [];
    for (var i = 0; i < cards.length; i++) {
        var parts = [];
        for (var t = 0; t < cards[i].textFrames.items.length; t++) {
            parts.push(cards[i].textFrames.items[t].contents);
        }
        out.push(parts.join("\r"));
    }
    return out;
}

/* Roda o script com sobrescritas no bloco CONFIG. */
function runWith(doc, overrides) {
    var patched = source;
    for (var key in overrides) {
        var re = new RegExp("(\\n\\s*" + key + ":\\s*)[^,\\n]+(,)");
        patched = patched.replace(re, "$1" + overrides[key] + "$2");
    }
    alerts = [];
    var box = makeSandbox(doc);
    vm.runInContext(patched, box);
    return box;
}

/* Achata os cartoes desenhados numa geometria facil de conferir. */
function tilesOf(doc) {
    var cards = cardsOf(doc);
    var tiles = [];
    for (var c = 0; c < cards.length; c++) {
        var r = cards[c].pathItems.items[0];
        var texts = [];
        for (var t = 0; t < cards[c].textFrames.items.length; t++) {
            var f = cards[c].textFrames.items[t];
            var attrs = f.textRange.characterAttributes;
            var widest = 0;
            var body = f.contents.split("\r");
            for (var l = 0; l < body.length; l++) {
                if (body[l].length > widest) widest = body[l].length;
            }
            texts.push({
                contents: f.contents,
                x: f.position[0], y: f.position[1],
                lines: body.length, chars: widest,
                size: attrs.size, ink: attrs.fillColor,
                align: f.paragraphs[0].paragraphAttributes.justification === "right"
                    ? "right" : "left"
            });
        }
        tiles.push({
            left: r.left, right: r.left + r.width,
            top: r.top, bottom: r.top - r.height,
            width: r.width, height: r.height,
            radius: r.radius || 0,
            fill: r.fillColor,
            texts: texts
        });
    }
    return tiles;
}

// ---------------------------------------------------------------------------
console.log("\nDocumento CMYK, cores vindas da selecao");
// ---------------------------------------------------------------------------
var doc = makeDoc("cmyk-doc");
var group = { typename: "GroupItem", pageItems: [
    { typename: "PathItem", filled: true, fillColor: cmyk(0, 100, 100, 0), stroked: false }
] };
doc.selection = [
    { typename: "PathItem", filled: true, fillColor: cmyk(100, 0, 0, 0), stroked: false },
    group,
    { typename: "CompoundPathItem", pathItems: [
        { typename: "PathItem", filled: true, fillColor: gray(50), stroked: false }
    ] },
    { typename: "PathItem", filled: true, fillColor: spot("PANTONE 185 C", cmyk(0, 91, 76, 0)), stroked: false },
    { typename: "PathItem", filled: true, fillColor: { typename: "GradientColor" }, stroked: false },
    { typename: "PathItem", filled: true, fillColor: { typename: "PatternColor" }, stroked: false }
];
run(doc);

var labels = labelsOf(doc);
ok("criou a camada Color Codes", legendOf(doc) !== null);
ok("4 cores solidas viraram amostras", labels.length === 4, labels.length + ": " + JSON.stringify(labels));
ok("gradiente e padrao foram ignorados e reportados",
    alerts.length === 1 && /2 item/.test(alerts[0]), JSON.stringify(alerts));
ok("desceu no GroupItem", labels.join("\n").indexOf("#FF0000") !== -1, labels.join(" | "));
ok("desceu no CompoundPathItem", labels.join("\n").indexOf("#808080") !== -1, labels.join(" | "));

// O cartao tem quadros separados por papel, entao conferimos a estrutura em vez
// da string achatada: titulo, badge, coluna de rotulos e coluna de valores.
var spotTile = null;
var firstTiles = tilesOf(doc);
for (var i = 0; i < firstTiles.length; i++) {
    if (firstTiles[i].texts.length && firstTiles[i].texts[0].contents === "PANTONE 185 C") {
        spotTile = firstTiles[i];
    }
}
ok("spot color usou o nome real como titulo", spotTile !== null, labels.join(" | "));
if (spotTile) {
    var byRole = spotTile.texts;
    ok("spot: titulo alinhado a esquerda", byRole[0].align === "left");
    // Com showDeltaE "auto" o dE so aparece nos matches fracos, entao as duas
    // formas sao validas aqui.
    ok("spot: badge e o Pantone mais proximo, alinhado a direita",
        byRole[1].align === "right" &&
        /^PANTONE [^ ].*?(  dE [\d.]+)?$/.test(byRole[1].contents),
        byRole[1].contents);
    ok("spot: coluna de rotulos", byRole[2].contents === "HEX\rRGB\rCMYK", byRole[2].contents);

    var values = byRole[3].contents.split("\r");
    ok("spot: coluna de valores alinhada a direita", byRole[3].align === "right");
    ok("spot: valor HEX", /^#[0-9A-F]{6}$/.test(values[0]), values[0]);
    ok("spot: valor RGB com 3 numeros", /^\d+, \d+, \d+$/.test(values[1]), values[1]);
    ok("spot: valor CMYK com 4 numeros", /^\d+, \d+, \d+, \d+$/.test(values[2]), values[2]);

    var joined = "";
    for (var jt = 0; jt < byRole.length; jt++) joined += byRole[jt].contents;
    ok("spot: nenhum til no cartao", joined.indexOf("~") === -1, joined);
}

var cards = cardsOf(doc);
// Cartao bento: 1 retangulo + titulo + badge + coluna de rotulos + coluna de valores.
ok("cada cartao tem 1 retangulo e ate 4 quadros de texto",
    cards.length > 0 && cards[0].pathItems.items.length === 1 &&
    cards[0].textFrames.items.length > 1 && cards[0].textFrames.items.length <= 4,
    cards[0].textFrames.items.length + " quadros");
ok("retangulo foi pintado com CMYKColor num doc CMYK",
    cards[0].pathItems.items[0].fillColor.typename === "CMYKColor",
    cards[0].pathItems.items[0].fillColor.typename);
ok("retangulo esta preenchido e sem contorno",
    cards[0].pathItems.items[0].filled === true && cards[0].pathItems.items[0].stroked === false);

// ---------------------------------------------------------------------------
console.log("\nDeduplicacao e contornos");
// ---------------------------------------------------------------------------
doc = makeDoc("cmyk-doc");
doc.selection = [
    { typename: "PathItem", filled: true, fillColor: cmyk(0, 100, 100, 0), stroked: true, strokeColor: cmyk(0, 0, 0, 100) },
    { typename: "PathItem", filled: true, fillColor: cmyk(0, 100, 100, 0), stroked: false },
    { typename: "PathItem", filled: true, fillColor: cmyk(0, 100, 100, 0), stroked: true, strokeColor: cmyk(0, 0, 0, 100) }
];
run(doc);
ok("3 objetos com 2 cores unicas geram 2 amostras",
    labelsOf(doc).length === 2, labelsOf(doc).length + ": " + JSON.stringify(labelsOf(doc)));
ok("cor de contorno entrou na legenda",
    labelsOf(doc).join("\n").indexOf("#000000") !== -1, labelsOf(doc).join(" | "));

// ---------------------------------------------------------------------------
console.log("\nDocumento RGB, cores vindas do painel Swatches");
// ---------------------------------------------------------------------------
doc = makeDoc("rgb-doc", [
    { name: "Azul da marca", color: rgb(0, 51, 160) },
    { name: "Verde", color: rgb(0, 177, 64) },
    { name: "Registro", color: { typename: "GradientColor" } }
]);
run(doc);
labels = labelsOf(doc);
ok("2 swatches solidas viraram amostras", labels.length === 2, JSON.stringify(labels));
ok("nome da swatch virou titulo, em caixa alta",
    labels[0].indexOf("AZUL DA MARCA") === 0, labels[0]);
ok("hex correto para 0,51,160", labels[0].indexOf("#0033A0") !== -1, labels[0]);
ok("achou PANTONE 286 C", /PANTONE 286 C/.test(labels[0]), labels[0]);
cards = cardsOf(doc);
ok("retangulo foi pintado com RGBColor num doc RGB",
    cards[0].pathItems.items[0].fillColor.typename === "RGBColor",
    cards[0].pathItems.items[0].fillColor.typename);

// ---------------------------------------------------------------------------
console.log("\nTinta de spot color");
// ---------------------------------------------------------------------------
doc = makeDoc("cmyk-doc");
doc.selection = [
    { typename: "PathItem", filled: true, stroked: false,
      fillColor: spot("PANTONE 286 C", cmyk(100, 75, 0, 0), 100) },
    { typename: "PathItem", filled: true, stroked: false,
      fillColor: spot("PANTONE 286 C", cmyk(100, 75, 0, 0), 50) }
];
run(doc);
labels = labelsOf(doc);
ok("tinta 100% e 50% sao amostras distintas", labels.length === 2, JSON.stringify(labels));
ok("tinta 50% clareia a cor",
    labels[0].split("\r")[1] !== labels[1].split("\r")[1],
    labels[0].split("\r")[1] + " vs " + labels[1].split("\r")[1]);
// ---------------------------------------------------------------------------
console.log("\nGeometria do cartao bento");
// ---------------------------------------------------------------------------
/*
 * O cartao e a parte com mais como dar errado: coluna de valores colidindo com
 * a de rotulos, texto saindo por baixo da cor, bloco invadindo o vizinho.
 * Montamos 13 cores com nomes de comprimentos diferentes e conferimos o
 * desenho resultante.
 */
var PALETTE_NAMES = [
    "Vermelho da marca", "Azul", "Amarelo destaque muito longo", "Verde",
    "Grafite", "Areia", "Roxo", "Ciano", "Preto", "Off-white",
    "Laranja", "Rosa", "Petroleo"
];
doc = makeDoc("rgb-doc", PALETTE_NAMES.map(function (name, v) {
    return {
        name: name,
        color: rgb((v * 37) % 256, (v * 91) % 256, (v * 143) % 256)
    };
}));
run(doc);

var tiles = tilesOf(doc);
ok("13 cores geraram 13 cartoes", tiles.length === 13, "" + tiles.length);
ok("cartoes tem cantos arredondados", tiles[0].radius > 0, "" + tiles[0].radius);

// Fundo e painel ficam soltos no grupo raiz, atras dos cartoes.
var rootPaths = legendOf(doc).groupItems.items[0].pathItems.items;
ok("desenhou fundo e painel atras dos cartoes", rootPaths.length === 2,
    rootPaths.length + " formas de fundo");
if (rootPaths.length === 2) {
    var bg = rootPaths[0], panel = rootPaths[1];
    ok("o painel cabe dentro do fundo",
        panel.left > bg.left && panel.top < bg.top &&
        panel.left + panel.width < bg.left + bg.width,
        "painel " + panel.width.toFixed(0) + " vs fundo " + bg.width.toFixed(0));

    var outside = 0;
    for (var pt = 0; pt < tiles.length; pt++) {
        if (tiles[pt].left < panel.left - 0.01) outside++;
        else if (tiles[pt].right > panel.left + panel.width + 0.01) outside++;
        else if (tiles[pt].top > panel.top + 0.01) outside++;
        else if (tiles[pt].bottom < panel.top - panel.height - 0.01) outside++;
    }
    ok("todo cartao cabe dentro do painel", outside === 0, outside + " para fora");
}

// Agrupa por topo: cartoes da mesma linha compartilham topo e altura.
var rows = {};
for (var t3 = 0; t3 < tiles.length; t3++) {
    var key = tiles[t3].top.toFixed(4);
    if (!rows[key]) rows[key] = [];
    rows[key].push(tiles[t3]);
}
var rowKeys = Object.keys(rows).sort(function (a, b) { return Number(b) - Number(a); });
console.log("  " + rowKeys.length + " linhas: " +
    rowKeys.map(function (k) { return rows[k].length + " cartoes"; }).join(", "));

var sameHeight = true, overlap = false, gapWrong = false;
for (var rk = 0; rk < rowKeys.length; rk++) {
    var rowTiles = rows[rowKeys[rk]].slice().sort(function (a, b) { return a.left - b.left; });
    for (var q2 = 0; q2 < rowTiles.length; q2++) {
        if (Math.abs(rowTiles[q2].height - rowTiles[0].height) > 1e-6) sameHeight = false;
        if (q2 > 0) {
            var gapActual = rowTiles[q2].left - rowTiles[q2 - 1].right;
            if (gapActual < -1e-6) overlap = true;
            else if (Math.abs(gapActual - GAP_X) > 1e-6) gapWrong = true;
        }
    }
}
ok("cartoes da mesma linha tem a mesma altura", sameHeight);
ok("nenhum cartao invade o vizinho", overlap === false);
ok("respiro entre cartoes e exatamente gapX", gapWrong === false);
ok("sem mosaico, todos os cartoes tem a mesma largura",
    tiles[0].width === tiles[1].width && tiles[0].width === tiles[5].width,
    tiles[0].width + " / " + tiles[1].width + " / " + tiles[5].width);

/*
 * Regressao: o texto tem de caber dentro da cor nos quatro lados. A coluna de
 * valores e ancorada a direita, entao cresce para a ESQUERDA — conferir so a
 * coordenada de ancoragem nao diria nada. Uma versao anterior so olhava a borda
 * esquerda e deixou passar rotulo vazando por cima do cartao vizinho.
 */
var escapedH = 0, escapedV = 0, collided = 0;
for (var t5 = 0; t5 < tiles.length; t5++) {
    var tile = tiles[t5];
    var spans = [];
    for (var tx = 0; tx < tile.texts.length; tx++) {
        var f = tile.texts[tx];
        var w = f.chars * f.size * 0.55;
        var from = f.align === "right" ? f.x - w : f.x;
        var to = f.align === "right" ? f.x : f.x + w;
        if (from < tile.left - 0.5 || to > tile.right + 0.5) escapedH++;

        var topLine = f.y + f.size;
        var lastLine = f.y - (f.lines - 1) * f.size * 1.3;
        if (topLine > tile.top + 0.5 || lastLine < tile.bottom - 0.5) escapedV++;

        spans.push({ from: from, to: to, y: f.y, align: f.align });
    }
    // Rotulo e valor da mesma faixa nao podem se sobrepor.
    for (var a = 0; a < spans.length; a++) {
        for (var b2 = a + 1; b2 < spans.length; b2++) {
            if (Math.abs(spans[a].y - spans[b2].y) > 0.01) continue;
            if (spans[a].align === spans[b2].align) continue;
            var left = spans[a].align === "left" ? spans[a] : spans[b2];
            var right = spans[a].align === "left" ? spans[b2] : spans[a];
            if (left.to > right.from + 0.5) collided++;
        }
    }
}
ok("nenhum texto vaza na horizontal", escapedH === 0, escapedH + " vazaram");
ok("nenhum texto vaza na vertical", escapedV === 0, escapedV + " vazaram");
ok("coluna de rotulos nao colide com a de valores", collided === 0, collided + " colisoes");

// A tinta e derivada da cor, nao preto ou branco: o que temos de garantir e o
// contraste minimo configurado.
var lowContrast = 0, pureInk = 0;
for (var t6 = 0; t6 < tiles.length; t6++) {
    var fill = [tiles[t6].fill.red, tiles[t6].fill.green, tiles[t6].fill.blue];
    for (var ti = 0; ti < tiles[t6].texts.length; ti++) {
        var ic = tiles[t6].texts[ti].ink;
        var inkRgb = [ic.red, ic.green, ic.blue];
        if (probeBox.contrastRatio(fill, inkRgb) < 4.5 - 1e-6) lowContrast++;
        var isPure = (inkRgb[0] === inkRgb[1] && inkRgb[1] === inkRgb[2] &&
                      (inkRgb[0] === 0 || inkRgb[0] === 255));
        if (isPure) pureInk++;
    }
}
ok("todo texto atinge o contraste minimo", lowContrast === 0, lowContrast + " abaixo de 4.5");
/*
 * deriveInkColor cai para preto/branco quando nenhum L com a mesma matiz
 * atinge o contraste pedido — acontece em cores ja muito claras ou escuras.
 * O que o teste garante e que isso seja a excecao, nao a regra: se virasse
 * regra, o efeito de tinta tonal teria se perdido sem ninguem notar.
 */
var tintedTiles = 0;
for (var t7 = 0; t7 < tiles.length; t7++) {
    var anyTinted = false;
    for (var t8 = 0; t8 < tiles[t7].texts.length; t8++) {
        var k2 = tiles[t7].texts[t8].ink;
        if (!(k2.red === k2.green && k2.green === k2.blue &&
              (k2.red === 0 || k2.red === 255))) anyTinted = true;
    }
    if (anyTinted) tintedTiles++;
}
ok("a maioria dos cartoes usa tinta derivada da cor, nao preto/branco",
    tintedTiles > tiles.length / 2, tintedTiles + "/" + tiles.length + " com tinta tonal");

// ---------------------------------------------------------------------------
console.log("\nMosaico do bento (bentoMosaic: true)");
// ---------------------------------------------------------------------------
doc = makeDoc("rgb-doc");
doc.selection = [];
for (var v3 = 0; v3 < 13; v3++) {
    doc.selection.push({
        typename: "PathItem", filled: true, stroked: false,
        fillColor: rgb((v3 * 37) % 256, (v3 * 91) % 256, (v3 * 143) % 256)
    });
}
runWith(doc, { bentoMosaic: "true", columns: "4", source: '"auto"' });

var mTiles = tilesOf(doc);
var minW = mTiles[0].width, maxW = mTiles[0].width;
var minH = mTiles[0].height, maxH = mTiles[0].height;
for (var mt = 0; mt < mTiles.length; mt++) {
    if (mTiles[mt].width < minW) minW = mTiles[mt].width;
    if (mTiles[mt].width > maxW) maxW = mTiles[mt].width;
    if (mTiles[mt].height < minH) minH = mTiles[mt].height;
    if (mTiles[mt].height > maxH) maxH = mTiles[mt].height;
}
ok("mosaico tem cartoes largos e estreitos", maxW > minW,
    "larguras de " + minW.toFixed(0) + " a " + maxW.toFixed(0));
ok("cartao largo e o dobro do estreito mais o respiro",
    Math.abs(maxW - (minW * 2 + GAP_X)) < 1e-6,
    maxW.toFixed(1) + " vs " + (minW * 2 + GAP_X).toFixed(1));
ok("mosaico tem linhas altas e normais", maxH > minH,
    "alturas de " + minH.toFixed(0) + " a " + maxH.toFixed(0));

var mOverlap = false;
var mRows = {};
for (var mr = 0; mr < mTiles.length; mr++) {
    var mk = mTiles[mr].top.toFixed(4);
    if (!mRows[mk]) mRows[mk] = [];
    mRows[mk].push(mTiles[mr]);
}
for (var mrk in mRows) {
    var sorted = mRows[mrk].slice().sort(function (a, b) { return a.left - b.left; });
    for (var ms = 1; ms < sorted.length; ms++) {
        if (sorted[ms].left - sorted[ms - 1].right < -1e-6) mOverlap = true;
    }
}
ok("mosaico nao sobrepoe cartoes", mOverlap === false);

// ---------------------------------------------------------------------------
console.log("\nLayout grid (modo alternativo)");
// ---------------------------------------------------------------------------
doc = makeDoc("rgb-doc");
doc.selection = [];
for (var v2 = 0; v2 < 7; v2++) {
    doc.selection.push({
        typename: "PathItem", filled: true, stroked: false,
        fillColor: rgb((v2 * 53) % 256, (v2 * 17) % 256, (v2 * 211) % 256)
    });
}
runWith(doc, { layout: '"grid"', source: '"auto"' });

var gTiles = tilesOf(doc);
ok("grid desenhou os 7 blocos", gTiles.length === 7, "" + gTiles.length);
var allSameSize = true, allBelow = true, allBlack = true, oneFrame = true;
for (var g2 = 0; g2 < gTiles.length; g2++) {
    if (gTiles[g2].width !== gTiles[0].width ||
        gTiles[g2].height !== gTiles[0].height) allSameSize = false;
    if (gTiles[g2].texts.length !== 1) oneFrame = false;
    if (gTiles[g2].texts[0].y > gTiles[g2].bottom) allBelow = false;
    if (gTiles[g2].texts[0].ink.red !== 0) allBlack = false;
}
ok("grid: todos os blocos com o mesmo tamanho", allSameSize,
    gTiles[0].width + "x" + gTiles[0].height);
ok("grid: um unico quadro de texto por bloco", oneFrame);
ok("grid: rotulo fica abaixo da amostra, nao dentro", allBelow);
ok("grid: rotulo sempre em preto", allBlack);
ok("grid: nao desenha painel de fundo",
    legendOf(doc).groupItems.items[0].pathItems.items.length === 0);


// ---------------------------------------------------------------------------
console.log("\nEntrada por codigos colados, com grupos");
// ---------------------------------------------------------------------------
doc = makeDoc("rgb-doc");
runPasted(doc,
    "Principais\n" +
    "Rosa: 255, 153, 255\n" +
    "Amarelo: #F8F852\n" +
    "Copas: #851057\n" +
    "Secundarias\n" +
    "Bege: 255, 217, 218\n" +
    "Ouro: #FFDD17\n"
);

ok("abriu a caixa de entrada", dialogShown === 1, "" + dialogShown);
var pTiles = tilesOf(doc);
ok("5 codigos viraram 5 cartoes", pTiles.length === 5, "" + pTiles.length);
ok("nao precisou de nada no documento",
    doc.selection.length === 0 && doc.swatches.length === 0);

var byName = {};
for (var pt2 = 0; pt2 < pTiles.length; pt2++) {
    byName[pTiles[pt2].texts[0].contents] = pTiles[pt2];
}
ok("nomes viraram titulos em caixa alta",
    byName["ROSA"] && byName["AMARELO"] && byName["COPAS"] &&
    byName["BEGE"] && byName["OURO"],
    Object.keys(byName).join(", "));

var rosa = byName["ROSA"];
ok("RGB colado virou a cor do cartao",
    Math.round(rosa.fill.red) === 255 && Math.round(rosa.fill.green) === 153 &&
    Math.round(rosa.fill.blue) === 255,
    rosa.fill.red + "," + rosa.fill.green + "," + rosa.fill.blue);
var rosaValues = rosa.texts[3].contents.split("\r");
ok("HEX foi derivado do RGB colado", rosaValues[0] === "#FF99FF", rosaValues[0]);
ok("CMYK foi derivado do RGB colado", /^\d+, \d+, \d+, \d+$/.test(rosaValues[2]),
    rosaValues[2]);
ok("achou o Pantone a partir do RGB colado",
    /^PANTONE /.test(rosa.texts[1].contents), rosa.texts[1].contents);

// Titulos de grupo ficam soltos no grupo raiz, junto do painel.
var rootTexts = legendOf(doc).groupItems.items[0].textFrames.items;
var headings = [];
for (var ht = 0; ht < rootTexts.length; ht++) headings.push(rootTexts[ht].contents);
ok("desenhou os dois titulos de grupo",
    headings.length === 2 && headings[0] === "PRINCIPAIS" && headings[1] === "SECUNDARIAS",
    JSON.stringify(headings));

// O grupo Secundarias tem de comecar abaixo de todo o grupo Principais.
var lowestPrincipal = Infinity, highestSecundaria = -Infinity;
var principais = ["ROSA", "AMARELO", "COPAS"];
var secundarias = ["BEGE", "OURO"];
for (var pp = 0; pp < principais.length; pp++) {
    if (byName[principais[pp]].bottom < lowestPrincipal) {
        lowestPrincipal = byName[principais[pp]].bottom;
    }
}
for (var ss = 0; ss < secundarias.length; ss++) {
    if (byName[secundarias[ss]].top > highestSecundaria) {
        highestSecundaria = byName[secundarias[ss]].top;
    }
}
ok("o 2o grupo comeca abaixo do 1o", highestSecundaria < lowestPrincipal,
    highestSecundaria.toFixed(0) + " vs " + lowestPrincipal.toFixed(0));
ok("cada grupo comeca numa linha nova",
    byName["BEGE"].left === byName["ROSA"].left,
    byName["BEGE"].left + " vs " + byName["ROSA"].left);

// Cancelar a caixa nao pode desenhar nada.
doc = makeDoc("rgb-doc");
runPasted(doc, null);
ok("cancelar nao desenha nem avisa",
    legendOf(doc) === null && alerts.length === 0, JSON.stringify(alerts));

// Texto sem nenhum codigo reconhecivel: avisa em vez de desenhar vazio.
doc = makeDoc("rgb-doc");
runPasted(doc, "so um texto qualquer\nsem cor nenhuma aqui\n");
ok("texto sem codigo avisa e nao desenha",
    legendOf(doc) === null && alerts.length === 1 && /Nenhum codigo/.test(alerts[0]),
    JSON.stringify(alerts));

// Linha invalida nao derruba o resto, e o aviso diz o que foi ignorado.
doc = makeDoc("rgb-doc");
runPasted(doc, "Boa: #FF0000\nRuim: 300, 10, 10\n");
ok("linha invalida nao impede as validas", tilesOf(doc).length === 1,
    "" + tilesOf(doc).length);
ok("o aviso relata a linha ignorada",
    alerts.length === 1 && /nao entendida/.test(alerts[0]), JSON.stringify(alerts));

// Sem titulo de grupo, nao deve sobrar cabecalho solto.
doc = makeDoc("rgb-doc");
runPasted(doc, "#FF0000\n#00FF00\n");
ok("lista sem grupo nao desenha titulo",
    legendOf(doc).groupItems.items[0].textFrames.items.length === 0);
ok("lista sem grupo desenha os cartoes", tilesOf(doc).length === 2);

// A mesma cor em grupos diferentes e legitima e nao pode ser deduplicada.
doc = makeDoc("rgb-doc");
runPasted(doc, "Principais\nVermelho: #FF0000\nSecundarias\nVermelho: #FF0000\n");
ok("cor repetida em grupos diferentes aparece nos dois",
    tilesOf(doc).length === 2, "" + tilesOf(doc).length);

// ---------------------------------------------------------------------------
console.log("\nCasos de borda");
// ---------------------------------------------------------------------------
doc = makeDoc("cmyk-doc");
doc.selection = [];
doc.swatches = [];
doc.swatches.getSelected = function () { return []; };
run(doc);
ok("documento sem cor nenhuma avisa em vez de quebrar",
    alerts.length === 1 && /Nenhuma cor/.test(alerts[0]), JSON.stringify(alerts));
ok("nao desenhou nada", legendOf(doc) === null || cardsOf(doc).length === 0);

doc = makeDoc("cmyk-doc");
doc.selection = [{ typename: "PathItem", filled: true, fillColor: { typename: "GradientColor" }, stroked: false }];
run(doc);
ok("selecao so com gradiente avisa e nao desenha",
    alerts.length === 1 && /Nenhuma cor solida/.test(alerts[0]), JSON.stringify(alerts));

alerts = [];
var emptyBox = makeSandbox(makeDoc("cmyk-doc"));
emptyBox.app.documents = [];
vm.runInContext(source, emptyBox);
ok("sem documento aberto avisa e sai",
    alerts.length === 1 && /Abra um documento/.test(alerts[0]), JSON.stringify(alerts));

// Rodar duas vezes seguidas deve reaproveitar a camada, nao empilhar.
doc = makeDoc("cmyk-doc");
doc.selection = [{ typename: "PathItem", filled: true, fillColor: cmyk(0, 100, 100, 0), stroked: false }];
run(doc);
run(doc);
var layerCount = 0;
for (var L = 0; L < doc.layers.length; L++) if (doc.layers[L].name === "Color Codes") layerCount++;
ok("rodar duas vezes reutiliza a camada", layerCount === 1, layerCount + " camadas");

// ---------------------------------------------------------------------------
console.log(
    "\n" + (checks - failures) + "/" + checks + " verificacoes passaram" +
    (failures ? "  (" + failures + " falha(s))" : "")
);
process.exit(failures ? 1 : 0);
