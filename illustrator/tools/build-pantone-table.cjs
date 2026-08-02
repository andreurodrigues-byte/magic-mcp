/*
 * Gera ColorCodesLegend.jsx a partir de ColorCodesLegend.template.jsx,
 * substituindo o marcador /*__PANTONE_TABLE__* / pela tabela Pantone.
 *
 * Fonte: https://github.com/thompsongl/pantonr (MIT, (c) 2015 Greg Thompson)
 *        dist/pantone_coated.json — conjunto Solid Coated.
 *
 * Uso (a partir da raiz do repositorio):
 *   git clone --depth 1 https://github.com/thompsongl/pantonr.git /tmp/pantonr
 *   node illustrator/tools/build-pantone-table.cjs /tmp/pantonr/dist/pantone_coated.json
 *
 * Formato de saida: uma unica string, entradas separadas por "|", campos por ";".
 *   <codigo sem o prefixo PANTONE>;<RRGGBB>
 * O prefixo "PANTONE " e removido aqui e recolocado na exibicao, para encurtar
 * a string embutida no .jsx.
 *
 * Por que o hex e nao o campo `lab` do dataset:
 * o `lab` e a medicao da tinta impressa, que para azuis e ciano saturados cai
 * bem fora do gamut sRGB; o `hex` e a versao ja recortada para tela. Os dois
 * divergem em ate dE 16 (300 C, Process Blue, Medium Blue). Como a entrada do
 * script e sempre uma cor de documento do Illustrator, comparar contra o hex
 * mantem os dois lados no mesmo gamut. Medido no conjunto de 12 cores de marca
 * de illustrator/test: hex acerta 9/12 em primeiro lugar (posicao media 2.0),
 * o lab medido acerta 4/12 (posicao media 8.3).
 */

var fs = require("fs");
var path = require("path");

var src = process.argv[2];
if (!src) {
  console.error("uso: node illustrator/tools/build-pantone-table.cjs <pantone_coated.json>");
  process.exit(1);
}

var templatePath = path.join(__dirname, "..", "ColorCodesLegend.template.jsx");
var outputPath = path.join(__dirname, "..", "ColorCodesLegend.jsx");
var MARKER = "/*__PANTONE_TABLE__*/";

var data = JSON.parse(fs.readFileSync(src, "utf8"));
var out = [];
var seen = {};

Object.keys(data).forEach(function (key) {
  var entry = data[key];
  if (!entry) return;

  var hex = String(entry.hex || "").replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return;

  var name = String(entry.name || "").replace(/^PANTONE\s+/i, "").trim();
  if (!name) return;

  // Variantes "2X" sao double-hit de impressao, nao cores solidas do fan deck.
  if (/\s2X$/i.test(name)) return;
  if (seen[name]) return;
  seen[name] = true;

  out.push(name + ";" + hex);
});

var table = out.join("|");

// A tabela e injetada dentro de uma string literal com aspas duplas no .jsx.
if (table.indexOf('"') !== -1 || table.indexOf("\\") !== -1) {
  console.error("erro: a tabela contem aspas ou barra invertida e quebraria o literal");
  process.exit(1);
}

var template = fs.readFileSync(templatePath, "utf8");
if (template.indexOf(MARKER) === -1) {
  console.error("erro: marcador " + MARKER + " nao encontrado em " + templatePath);
  process.exit(1);
}

fs.writeFileSync(outputPath, template.split(MARKER).join(table), "utf8");

console.error(
  out.length + " cores -> " + path.relative(process.cwd(), outputPath) +
  " (" + fs.statSync(outputPath).size + " bytes)"
);
