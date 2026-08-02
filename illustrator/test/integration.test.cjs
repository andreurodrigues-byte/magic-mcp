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
    // O Pantone mais proximo do alternate CMYK da spot nao e necessariamente a
    // propria spot; por isso as duas linhas saem marcadas como aproximacao.
    ok("spot: 1a linha de pantone marcada como aproximacao",
        /^~+ PANTONE .+  dE /.test(sl[3]), sl[3]);
    ok("spot: 2a linha de pantone marcada como aproximacao",
        /^~+ PANTONE .+  dE /.test(sl[4]), sl[4]);
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
