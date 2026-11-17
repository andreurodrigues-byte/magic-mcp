/*
 * Gera a prancheta: um .jsx do Illustrator com as cores ja embutidas, mais um
 * preview em SVG para conferir antes de abrir o Illustrator.
 *
 *   node scripts/build-board.cjs <lista.txt> [pasta-de-saida]
 *
 * A lista e o texto que o usuario colou, no formato que parseColorInput aceita
 * (ver o .jsx). Saida padrao: a pasta onde esta a lista.
 *
 * Nao reimplementa nada de cor: carrega o proprio ColorCodesLegend.jsx e usa
 * as funcoes dele, entao os valores do preview sao exatamente os que o
 * Illustrator vai desenhar.
 */

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var SCRIPT = path.join(__dirname, "..", "ColorCodesLegend.jsx");

function die(msg) {
  console.error("erro: " + msg);
  process.exit(1);
}

var listPath = process.argv[2];
if (!listPath) die("uso: node scripts/build-board.cjs <lista.txt> [pasta-de-saida]");
if (!fs.existsSync(listPath)) die("lista nao encontrada: " + listPath);
if (!fs.existsSync(SCRIPT)) die("ColorCodesLegend.jsx nao encontrado em " + SCRIPT);

var outDir = process.argv[3] || path.dirname(path.resolve(listPath));
fs.mkdirSync(outDir, { recursive: true });

var list = fs.readFileSync(listPath, "utf8");
var source = fs.readFileSync(SCRIPT, "utf8");

// --- carrega o .jsx sem disparar main() (nao existe `app` aqui) -------------

var api = {};
vm.createContext(api);
vm.runInContext(source, api, { filename: SCRIPT });

// --- confere a lista antes de gerar qualquer coisa --------------------------

var parsed = api.parseColorInput(list);

var total = 0;
for (var g = 0; g < parsed.groups.length; g++) total += parsed.groups[g].colors.length;
if (total === 0) {
  die("nenhum codigo de cor reconhecido em " + listPath +
      (parsed.errors.length ? "\n  " + parsed.errors.join("\n  ") : ""));
}

// --- embute a lista no .jsx -------------------------------------------------

/*
 * ExtendScript nao tem template literal, entao a lista vira uma string de
 * aspas duplas com \r entre as linhas.
 *
 * Tudo que nao e ASCII imprimivel sai como \uXXXX. O .jsx fica em ASCII puro e
 * para de depender de o Illustrator adivinhar a codificacao do arquivo — sem
 * isso um "Secundarias" com acento pode chegar truncado ou trocado no Mac.
 */
function toJsxString(text) {
  var lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  var clean = [];

  for (var i = 0; i < lines.length; i++) {
    var out = "";
    var line = lines[i];
    for (var c = 0; c < line.length; c++) {
      var ch = line.charAt(c);
      var code = line.charCodeAt(c);

      if (ch === "\\") out += "\\\\";
      else if (ch === '"') out += '\\"';
      else if (code >= 32 && code < 127) out += ch;
      else if (code < 32 || code === 127) continue; // controle: nao serve de cor
      else {
        var hex = code.toString(16).toUpperCase();
        while (hex.length < 4) hex = "0" + hex;
        out += "\\u" + hex;
      }
    }
    clean.push(out);
  }
  return '"' + clean.join("\\r") + '"';
}

var MARKER = 'var EMBEDDED_COLORS = "";';
var occurrences = source.split(MARKER).length - 1;
if (occurrences !== 1) {
  die("esperava 1 linha EMBEDDED_COLORS vazia no .jsx, achei " + occurrences +
      " — o arquivo base mudou?");
}

var jsx = source.replace(MARKER, "var EMBEDDED_COLORS = " + toJsxString(list) + ";");
if (jsx === source) die("a substituicao de EMBEDDED_COLORS nao pegou");

// O arquivo gerado nao pode mais abrir a caixa: se abrir, a lista nao entrou.
if (jsx.indexOf('var EMBEDDED_COLORS = "";') !== -1) {
  die("a lista nao foi embutida");
}

var jsxPath = path.join(outDir, "ColorBoard.jsx");
fs.writeFileSync(jsxPath, jsx, "utf8");

// --- preview em SVG ---------------------------------------------------------

var previewPath = path.join(outDir, "preview.svg");
try {
  var render = require(path.join(__dirname, "render-preview.cjs"));
  render(jsx, previewPath);
} catch (e) {
  console.error("aviso: preview nao gerado (" + e.message + ")");
  previewPath = null;
}

// --- relatorio para o Claude montar a resposta ------------------------------

var report = { jsx: jsxPath, preview: previewPath, groups: [], errors: parsed.errors };

for (var gi = 0; gi < parsed.groups.length; gi++) {
  var group = parsed.groups[gi];
  var rows = [];
  for (var ci = 0; ci < group.colors.length; ci++) {
    var color = group.colors[ci];
    var rgb = color.rgb || api.cmykToRgbNaive(color.cmyk);
    var cmyk = color.cmyk || api.rgbToCmykNaive(rgb);
    var hit = api.nearestPantone(rgb, 1)[0];

    var round = function (v) { return Math.round(v); };
    rows.push({
      name: color.name || "",
      hex: api.toHex(rgb),
      rgb: rgb.map(round).join(", "),
      cmyk: cmyk.map(round).join(", "),
      pantone: hit.name,
      deltaE: Math.round(hit.deltaE * 10) / 10
    });
  }
  report.groups.push({ name: group.name, colors: rows });
}

console.log(JSON.stringify(report, null, 1));
