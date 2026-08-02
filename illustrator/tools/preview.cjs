/*
 * Renderiza um SVG com o layout que ColorCodesLegend.jsx produziria, para
 * conferir a diagramacao sem abrir o Illustrator.
 *
 * Roda o .jsx real contra o mesmo DOM simulado dos testes e desenha os
 * retangulos e textos que sairam. A geometria e a de verdade — o que muda e so
 * o meio de saida.
 *
 *   node illustrator/tools/preview.cjs [bento|grid] [saida.svg]
 */

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var layout = process.argv[2] || "bento";
var outPath = process.argv[3] || path.join(__dirname, "..", "preview-" + layout + ".svg");

var source = fs.readFileSync(path.join(__dirname, "..", "ColorCodesLegend.jsx"), "utf8");
if (layout === "grid") source = source.replace('layout: "bento"', 'layout: "grid"');

// Paleta de exemplo: claros, escuros e saturados, para exercitar o contraste.
var PALETTE = [
  ["Vermelho da marca", [228, 0, 43]],
  ["Azul institucional", [0, 51, 160]],
  ["Amarelo destaque", [255, 184, 28]],
  ["Verde apoio", [0, 177, 64]],
  ["Grafite", [83, 86, 90]],
  ["Areia", [214, 199, 166]],
  ["Roxo", [95, 37, 159]],
  ["Ciano", [0, 156, 222]],
  ["Preto marca", [45, 41, 38]],
  ["Off-white", [244, 242, 237]],
  ["Laranja", [255, 105, 0]],
  ["Rosa", [214, 37, 152]],
  ["Petroleo", [0, 84, 92]]
];

// --- DOM simulado -----------------------------------------------------------

function makeContainer() {
  var node = {
    typename: "GroupItem", name: "", pageItems: [],
    pathItems: {
      items: [],
      rectangle: function (top, left, w, h) {
        var r = { top: top, left: left, width: w, height: h, filled: false, stroked: false, fillColor: null };
        this.items.push(r); node.pageItems.push(r); return r;
      }
    },
    textFrames: {
      items: [],
      pointText: function (pos) {
        var t = { position: pos, contents: "", textRange: { characterAttributes: {} } };
        this.items.push(t); node.pageItems.push(t); return t;
      }
    },
    groupItems: {
      items: [],
      add: function () { var g = makeContainer(); this.items.push(g); node.pageItems.push(g); return g; }
    }
  };
  return node;
}

var doc = makeContainer();
doc.documentColorSpace = "rgb-doc";
doc.width = 1000;
doc.artboards = [{ artboardRect: [0, 2000, 800, 0] }];
doc.artboards.getActiveArtboardIndex = function () { return 0; };
// Usa swatches nomeadas em vez da selecao: e o caso com rotulo mais longo
// (ganha a linha do nome), ou seja, o pior cenario para o ajuste de corpo.
doc.swatches = PALETTE.map(function (entry) {
  return {
    name: entry[0],
    color: { typename: "RGBColor", red: entry[1][0], green: entry[1][1], blue: entry[1][2] }
  };
});
doc.swatches.getSelected = function () { return []; };
var layers = [];
doc.layers = layers;
doc.layers.add = function () { var l = makeContainer(); layers.push(l); return l; };
doc.layers.getByName = function (n) {
  for (var i = 0; i < layers.length; i++) if (layers[i].name === n) return layers[i];
  throw new Error("no layer");
};
doc.selection = [];

var box = {
  alert: function () {},
  DocumentColorSpace: { CMYK: "cmyk-doc", RGB: "rgb-doc" },
  ImageColorSpace: { RGB: "rgb", CMYK: "cmyk", GrayScale: "gray", LAB: "lab" },
  ColorConvertPurpose: { previewpurpose: "preview", defaultpurpose: "default" },
  CMYKColor: function () { this.typename = "CMYKColor"; },
  RGBColor: function () { this.typename = "RGBColor"; this.red = 0; this.green = 0; this.blue = 0; },
  GrayColor: function () { this.typename = "GrayColor"; this.gray = 0; },
  app: {
    documents: [doc], activeDocument: doc, redraw: function () {},
    textFonts: { getByName: function () { throw new Error("no font"); } },
    convertSampleColor: function (from, comps, to) {
      var r = comps[0], g = comps[1], b = comps[2];
      if (to === "cmyk") {
        var k = 1 - Math.max(r, g, b) / 255;
        if (k >= 1) return [0, 0, 0, 100];
        return [(1 - r / 255 - k) / (1 - k) * 100, (1 - g / 255 - k) / (1 - k) * 100,
                (1 - b / 255 - k) / (1 - k) * 100, k * 100];
      }
      return [r, g, b];
    }
  }
};
vm.createContext(box);
vm.runInContext(source, box);

// --- SVG --------------------------------------------------------------------

var legend = null;
for (var i = 0; i < layers.length; i++) if (layers[i].name === "Color Codes") legend = layers[i];
var cards = legend.groupItems.items[0].groupItems.items;

var shapes = [];
var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

for (var c = 0; c < cards.length; c++) {
  var rect = cards[c].pathItems.items[0];
  var text = cards[c].textFrames.items[0];
  shapes.push({ rect: rect, text: text });
  if (rect.left < minX) minX = rect.left;
  if (rect.left + rect.width > maxX) maxX = rect.left + rect.width;
  if (rect.top - rect.height < minY) minY = rect.top - rect.height;
  if (rect.top > maxY) maxY = rect.top;
}

var pad = 24;
var W = (maxX - minX) + pad * 2;
var H = (maxY - minY) + pad * 2;
// Illustrator cresce para cima; SVG para baixo.
function sx(x) { return (x - minX + pad).toFixed(2); }
function sy(y) { return (maxY - y + pad).toFixed(2); }

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

var out = [];
out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W.toFixed(0) + '" height="' +
         H.toFixed(0) + '" viewBox="0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2) + '">');
out.push('<rect width="100%" height="100%" fill="#ffffff"/>');

for (var s = 0; s < shapes.length; s++) {
  var r = shapes[s].rect;
  var t = shapes[s].text;
  var fill = "rgb(" + Math.round(r.fillColor.red) + "," + Math.round(r.fillColor.green) +
             "," + Math.round(r.fillColor.blue) + ")";
  out.push('<rect x="' + sx(r.left) + '" y="' + sy(r.top) + '" width="' + r.width.toFixed(2) +
           '" height="' + r.height.toFixed(2) + '" fill="' + fill + '"/>');

  var ink = t.textRange.characterAttributes.fillColor;
  var inkCss = (ink && ink.red === 255) ? "#ffffff" : "#000000";
  var size = t.textRange.characterAttributes.size || 9;
  var leading = t.textRange.characterAttributes.leading || size * 1.3;

  var body = t.contents.split("\r");
  for (var l = 0; l < body.length; l++) {
    out.push('<text x="' + sx(t.position[0]) + '" y="' + sy(t.position[1] - l * leading) +
             '" font-family="Helvetica, Arial, sans-serif" font-size="' + size +
             '" fill="' + inkCss + '">' + esc(body[l]) + '</text>');
  }
}
out.push("</svg>");

fs.writeFileSync(outPath, out.join("\n"), "utf8");
console.log(layout + ": " + shapes.length + " blocos -> " + path.relative(process.cwd(), outPath) +
            "  (" + W.toFixed(0) + "x" + H.toFixed(0) + ")");
