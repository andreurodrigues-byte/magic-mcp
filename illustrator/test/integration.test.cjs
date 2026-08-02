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
                    textRange: { characterAttributes: {} }
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

function makeSandbox(doc) {
    var box = {
        alert: function (m) { alerts.push(String(m)); },
        DocumentColorSpace: { CMYK: "cmyk-doc", RGB: "rgb-doc" },
        ImageColorSpace: { RGB: "rgb", CMYK: "cmyk", GrayScale: "gray", LAB: "lab" },
        ColorConvertPurpose: { previewpurpose: "preview", defaultpurpose: "default" },
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

function run(doc) {
    alerts = [];
    var box = makeSandbox(doc);
    vm.runInContext(source, box);
    return box;
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

function labelsOf(doc) {
    var cards = cardsOf(doc);
    var out = [];
    for (var i = 0; i < cards.length; i++) {
        out.push(cards[i].textFrames.items[0].contents);
    }
    return out;
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
ok("desceu no GroupItem", /HEX #FF0000/.test(labels.join("\n")), labels.join(" | "));
ok("desceu no CompoundPathItem", /HEX #808080/.test(labels.join("\n")), labels.join(" | "));

var spotLabel = null;
for (var i = 0; i < labels.length; i++) if (/^PANTONE 185 C/.test(labels[i])) spotLabel = labels[i];
ok("spot color usou o nome real como titulo", spotLabel !== null, labels.join(" | "));
if (spotLabel) {
    var sl = spotLabel.split("\r");
    ok("spot: nome na 1a linha", sl[0] === "PANTONE 185 C", sl[0]);
    ok("spot: tem HEX", /^HEX #[0-9A-F]{6}$/.test(sl[1]), sl[1]);
    ok("spot: tem CMYK com 4 numeros", /^CMYK \d+ \d+ \d+ \d+$/.test(sl[2]), sl[2]);
    ok("spot: 1a linha de pantone", /^PANTONE .+  dE [\d.]+$/.test(sl[3]), sl[3]);
    ok("spot: 2a linha de pantone", /^PANTONE .+  dE [\d.]+$/.test(sl[4]), sl[4]);
    ok("spot: nenhum til no rotulo", spotLabel.indexOf("~") === -1, spotLabel);
}

var cards = cardsOf(doc);
ok("cada card tem 1 retangulo e 1 texto",
    cards.length > 0 && cards[0].pathItems.items.length === 1 && cards[0].textFrames.items.length === 1);
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
    /HEX #000000/.test(labelsOf(doc).join("\n")), labelsOf(doc).join(" | "));

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
ok("nome da swatch virou titulo", /^Azul da marca/.test(labels[0]), labels[0]);
ok("hex correto para 0,51,160", /HEX #0033A0/.test(labels[0]), labels[0]);
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
console.log("\nGeometria do layout bento");
// ---------------------------------------------------------------------------
/*
 * O bento e a parte com mais como dar errado: bloco invadindo o vizinho,
 * buraco na linha, texto saindo por baixo da cor. Aqui montamos 13 cores com
 * rotulos de comprimentos diferentes e conferimos o desenho resultante.
 */
doc = makeDoc("rgb-doc");
doc.selection = [];
for (var v = 0; v < 13; v++) {
    doc.selection.push({
        typename: "PathItem", filled: true, stroked: false,
        fillColor: rgb((v * 37) % 256, (v * 91) % 256, (v * 143) % 256)
    });
}
run(doc);

cards = cardsOf(doc);
ok("13 cores geraram 13 blocos", cards.length === 13, "" + cards.length);

// Reconstroi a geometria a partir do que foi desenhado.
var tiles = [];
for (var c2 = 0; c2 < cards.length; c2++) {
    var r2 = cards[c2].pathItems.items[0];
    var t2 = cards[c2].textFrames.items[0];
    tiles.push({
        left: r2.left, right: r2.left + r2.width,
        top: r2.top, bottom: r2.top - r2.height,
        width: r2.width, height: r2.height,
        textX: t2.position[0], textY: t2.position[1],
        contents: t2.contents,
        lines: t2.contents.split("\r").length,
        size: t2.textRange.characterAttributes.size,
        fill: r2.fillColor,
        ink: t2.textRange.characterAttributes.fillColor
    });
}

// Agrupa por topo: blocos da mesma linha compartilham topo e altura.
var rows = {};
for (var t3 = 0; t3 < tiles.length; t3++) {
    var key = tiles[t3].top.toFixed(4);
    if (!rows[key]) rows[key] = [];
    rows[key].push(tiles[t3]);
}
var rowKeys = Object.keys(rows).sort(function (a, b) { return Number(b) - Number(a); });
console.log("  " + rowKeys.length + " linhas: " +
    rowKeys.map(function (k) { return rows[k].length + " blocos"; }).join(", "));

var sameHeight = true, overlap = false, gapWrong = false, widthMismatch = false;
var expectedWidth = null;
for (var rk = 0; rk < rowKeys.length; rk++) {
    var rowTiles = rows[rowKeys[rk]].slice().sort(function (a, b) { return a.left - b.left; });

    for (var q2 = 0; q2 < rowTiles.length; q2++) {
        if (Math.abs(rowTiles[q2].height - rowTiles[0].height) > 1e-6) sameHeight = false;
        if (q2 > 0) {
            var gapActual = rowTiles[q2].left - rowTiles[q2 - 1].right;
            if (gapActual < -1e-6) overlap = true;
            // A ultima linha pode ficar incompleta; nas cheias o gap e exato.
            else if (Math.abs(gapActual - 18) > 1e-6) gapWrong = true;
        }
    }
    // Linhas cheias tem de terminar todas na mesma coluna da direita.
    var rowRight = rowTiles[rowTiles.length - 1].right;
    if (rk < rowKeys.length - 1) {
        if (expectedWidth === null) expectedWidth = rowRight;
        else if (Math.abs(rowRight - expectedWidth) > 1e-6) widthMismatch = true;
    }
}
ok("blocos da mesma linha tem a mesma altura", sameHeight);
ok("nenhum bloco invade o vizinho", overlap === false);
ok("respiro entre blocos e exatamente gapX", gapWrong === false);
ok("linhas cheias terminam na mesma borda direita", widthMismatch === false);

// A largura da coluna e automatica, entao comparamos os blocos entre si em vez
// de contra um numero fixo: o bento precisa ter dois tamanhos, quaisquer que
// sejam eles.
var minH = tiles[0].height, maxH = tiles[0].height;
var minW = tiles[0].width, maxW = tiles[0].width;
for (var t4 = 0; t4 < tiles.length; t4++) {
    if (tiles[t4].height < minH) minH = tiles[t4].height;
    if (tiles[t4].height > maxH) maxH = tiles[t4].height;
    if (tiles[t4].width < minW) minW = tiles[t4].width;
    if (tiles[t4].width > maxW) maxW = tiles[t4].width;
}
ok("existem blocos largos e estreitos", maxW > minW,
    "larguras de " + minW.toFixed(0) + " a " + maxW.toFixed(0));
ok("bloco largo e o dobro do estreito mais o respiro",
    Math.abs(maxW - (minW * 2 + 18)) < 1e-6,
    maxW.toFixed(1) + " vs " + (minW * 2 + 18).toFixed(1));
ok("existem linhas altas e normais", maxH > minH,
    "alturas de " + minH.toFixed(0) + " a " + maxH.toFixed(0));

/*
 * O texto tem de caber dentro da cor nos QUATRO lados.
 *
 * Regressao: a versao anterior so conferia a borda esquerda, e o rotulo vazava
 * pela direita nos blocos de 1 coluna — "PANTONE Dark Blue C  dE 1.3" a 9 pt
 * pede ~150 pt num bloco de 110. Ninguem viu ate o preview em SVG.
 */
var escapedH = 0, escapedV = 0;
var worstFill = 0;
for (var t5 = 0; t5 < tiles.length; t5++) {
    var tile = tiles[t5];
    var lead = tile.size * 1.3;
    var topLine = tile.textY + tile.size;                 // topo da 1a linha
    var lastLine = tile.textY - (tile.lines - 1) * lead;  // base da ultima

    if (tile.textX < tile.left) escapedH++;
    if (topLine > tile.top || lastLine < tile.bottom) escapedV++;

    // Largura estimada com o mesmo fator do script.
    var widest = 0;
    var body = tile.contents.split("\r");
    for (var bl = 0; bl < body.length; bl++) {
        if (body[bl].length > widest) widest = body[bl].length;
    }
    var textRight = tile.textX + widest * tile.size * 0.55;
    var usable = tile.right - 12; // menos o bentoPadding do lado direito
    if (textRight > usable + 0.5) escapedH++;

    var fillRatio = (textRight - tile.left) / tile.width;
    if (fillRatio > worstFill) worstFill = fillRatio;
}
ok("nenhum rotulo vaza na horizontal", escapedH === 0, escapedH + " vazaram");
ok("nenhum rotulo vaza na vertical", escapedV === 0, escapedV + " vazaram");
console.log("  rotulo mais largo ocupa " + (worstFill * 100).toFixed(0) + "% do seu bloco");

var shrunk = 0;
for (var t7 = 0; t7 < tiles.length; t7++) if (tiles[t7].size < 9) shrunk++;
console.log("  " + shrunk + "/" + tiles.length + " blocos precisaram encolher o texto");
var tooSmall = 0;
for (var t8 = 0; t8 < tiles.length; t8++) if (tiles[t8].size < 6) tooSmall++;
ok("nenhum texto abaixo do corpo minimo", tooSmall === 0, tooSmall + " blocos");

// Cor do texto tem de acompanhar o contraste da cor de fundo.
var inkWrong = 0;
for (var t6 = 0; t6 < tiles.length; t6++) {
    var f2 = tiles[t6].fill;
    var want = sandboxPick([f2.red, f2.green, f2.blue]);
    var got = (tiles[t6].ink.red === 255) ? "white" : "black";
    if (want !== got) inkWrong++;
}
ok("texto usa a cor de maior contraste em todo bloco", inkWrong === 0, inkWrong + " errados");

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
var gridBox = makeSandbox(doc);
alerts = [];
vm.runInContext(source.replace('layout: "bento"', 'layout: "grid"'), gridBox);

cards = cardsOf(doc);
ok("grid desenhou os 7 blocos", cards.length === 7, "" + cards.length);
var allSameSize = true, allBelow = true, allBlack = true;
var first = cards[0].pathItems.items[0];
for (var g2 = 0; g2 < cards.length; g2++) {
    var gr = cards[g2].pathItems.items[0];
    var gt = cards[g2].textFrames.items[0];
    // A largura e automatica; o que importa e serem todas iguais entre si.
    if (gr.width !== first.width || gr.height !== first.height) allSameSize = false;
    if (gt.position[1] > gr.top - gr.height) allBelow = false;
    if (gt.textRange.characterAttributes.fillColor.red !== 0) allBlack = false;
}
ok("grid: todos os blocos com o mesmo tamanho", allSameSize,
    first.width + "x" + first.height);
ok("grid: altura da amostra e a configurada", first.height === 110, "" + first.height);
ok("grid: rotulo fica abaixo da amostra, nao dentro", allBelow);
ok("grid: rotulo sempre em preto", allBlack);

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
