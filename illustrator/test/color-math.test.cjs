/*
 * Testa a matematica de cor de ColorCodesLegend.jsx em Node.
 *
 * O .jsx e carregado como fonte e avaliado num contexto sem `app`, entao o
 * bloco final (`if (typeof app !== "undefined") main()`) nao dispara e as
 * funcoes ficam acessiveis. E o arquivo real que roda no Illustrator, nao
 * uma copia.
 *
 *   node illustrator/test/color-math.test.cjs
 */

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var scriptPath = path.join(__dirname, "..", "ColorCodesLegend.jsx");
var source = fs.readFileSync(scriptPath, "utf8");

var sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: scriptPath });

var failures = 0;
var checks = 0;

function ok(label, condition, detail) {
    checks++;
    if (condition) return;
    failures++;
    console.log("  FALHOU  " + label + (detail ? "  ->  " + detail : ""));
}

function near(label, actual, expected, tol) {
    ok(
        label,
        Math.abs(actual - expected) <= tol,
        "obtido " + actual.toFixed(4) + ", esperado " + expected + " (tol " + tol + ")"
    );
}

// ---------------------------------------------------------------------------
console.log("\ntoHex - arredondamento e zero-padding");
// ---------------------------------------------------------------------------
ok("preto", sandbox.toHex([0, 0, 0]) === "#000000", sandbox.toHex([0, 0, 0]));
ok("branco", sandbox.toHex([255, 255, 255]) === "#FFFFFF", sandbox.toHex([255, 255, 255]));
ok(
    "componente baixo recebe zero a esquerda",
    sandbox.toHex([15, 1, 0]) === "#0F0100",
    sandbox.toHex([15, 1, 0])
);
ok(
    "float e arredondado, nao truncado em base 16",
    sandbox.toHex([254.6, 128.4, 0.5]) === "#FF8001",
    sandbox.toHex([254.6, 128.4, 0.5])
);
ok(
    "valores fora da faixa sao limitados",
    sandbox.toHex([300, -20, 255]) === "#FF00FF",
    sandbox.toHex([300, -20, 255])
);

// ---------------------------------------------------------------------------
console.log("\nrgbToLab - sRGB D65 contra valores de referencia");
// ---------------------------------------------------------------------------
var labCases = [
    { rgb: [255, 255, 255], lab: [100, 0, 0], label: "branco" },
    { rgb: [0, 0, 0], lab: [0, 0, 0], label: "preto" },
    { rgb: [255, 0, 0], lab: [53.2408, 80.0925, 67.2032], label: "vermelho puro" },
    { rgb: [0, 255, 0], lab: [87.7347, -86.1827, 83.1793], label: "verde puro" },
    { rgb: [0, 0, 255], lab: [32.297, 79.1875, -107.8602], label: "azul puro" },
    { rgb: [128, 128, 128], lab: [53.585, 0, 0], label: "cinza medio" }
];
for (var i = 0; i < labCases.length; i++) {
    var got = sandbox.rgbToLab(labCases[i].rgb);
    near(labCases[i].label + " L", got[0], labCases[i].lab[0], 0.01);
    near(labCases[i].label + " a", got[1], labCases[i].lab[1], 0.01);
    near(labCases[i].label + " b", got[2], labCases[i].lab[2], 0.01);
}

// ---------------------------------------------------------------------------
console.log("\ndeltaE2000 - dataset de Sharma, Wu & Dalal (2005)");
// ---------------------------------------------------------------------------
// Pares nos quais implementacoes ingenuas de CIEDE2000 tipicamente erram
// (descontinuidade de matiz, termo rotacional RT, cinzas de croma zero).
var sharma = [
    [[50.0000, 2.6772, -79.7751], [50.0000, 0.0000, -82.7485], 2.0425],
    [[50.0000, 3.1571, -77.2803], [50.0000, 0.0000, -82.7485], 2.8615],
    [[50.0000, 2.8361, -74.0200], [50.0000, 0.0000, -82.7485], 3.4412],
    [[50.0000, -1.3802, -84.2814], [50.0000, 0.0000, -82.7485], 1.0000],
    [[50.0000, -1.1848, -84.8006], [50.0000, 0.0000, -82.7485], 1.0000],
    [[50.0000, -0.9009, -85.5211], [50.0000, 0.0000, -82.7485], 1.0000],
    [[50.0000, 0.0000, 0.0000], [50.0000, -1.0000, 2.0000], 2.3669],
    [[50.0000, -1.0000, 2.0000], [50.0000, 0.0000, 0.0000], 2.3669],
    [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0009], 7.1792],
    [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0010], 7.1792],
    [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0011], 7.2195],
    [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0012], 7.2195],
    [[50.0000, -0.0010, 2.4900], [50.0000, 0.0009, -2.4900], 4.8045],
    [[50.0000, -0.0010, 2.4900], [50.0000, 0.0011, -2.4900], 4.7461],
    [[50.0000, 2.5000, 0.0000], [50.0000, 0.0000, -2.5000], 4.3065],
    [[50.0000, 2.5000, 0.0000], [73.0000, 25.0000, -18.0000], 27.1492],
    [[50.0000, 2.5000, 0.0000], [61.0000, -5.0000, 29.0000], 22.8977],
    [[50.0000, 2.5000, 0.0000], [56.0000, -27.0000, -3.0000], 31.9030],
    [[50.0000, 2.5000, 0.0000], [58.0000, 24.0000, 15.0000], 19.4535],
    [[50.0000, 2.5000, 0.0000], [50.0000, 3.1736, 0.5854], 1.0000],
    [[50.0000, 2.5000, 0.0000], [50.0000, 3.2972, 0.0000], 1.0000],
    [[50.0000, 2.5000, 0.0000], [50.0000, 1.8634, 0.5757], 1.0000],
    [[50.0000, 2.5000, 0.0000], [50.0000, 3.2592, 0.3350], 1.0000],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
    [[61.2901, 3.7196, -5.3901], [61.4292, 2.2480, -4.9620], 1.8731],
    [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
    [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
    [[36.4612, 47.8580, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
    [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, 0.0447], 1.4441],
    [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
    [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
    [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082]
];
var worst = 0;
for (var s = 0; s < sharma.length; s++) {
    var d = sandbox.deltaE2000(sharma[s][0], sharma[s][1]);
    var diff = Math.abs(d - sharma[s][2]);
    if (diff > worst) worst = diff;
    ok(
        "par " + (s + 1),
        diff <= 0.0001,
        "obtido " + d.toFixed(4) + ", esperado " + sharma[s][2]
    );
}
console.log("  " + sharma.length + " pares, maior desvio: " + worst.toExponential(2));

ok("simetria dE(x,y) == dE(y,x)",
    Math.abs(
        sandbox.deltaE2000([50, 2.5, 0], [61, -5, 29]) -
        sandbox.deltaE2000([61, -5, 29], [50, 2.5, 0])
    ) < 1e-9);
ok("dE de uma cor com ela mesma e zero",
    sandbox.deltaE2000([42, 13, -7], [42, 13, -7]) < 1e-12);

// ---------------------------------------------------------------------------
console.log("\nTabela Pantone");
// ---------------------------------------------------------------------------
var list = sandbox.getPantoneList();
ok("tabela carregou", list.length > 1000, list.length + " entradas");

var seen = {};
var dupes = 0;
for (var p = 0; p < list.length; p++) {
    if (seen[list[p].name]) dupes++;
    seen[list[p].name] = true;
    if (isNaN(list[p].lab[0]) || isNaN(list[p].lab[1]) || isNaN(list[p].lab[2])) {
        ok("Lab valido em " + list[p].name, false);
    }
    if (!/^#[0-9A-F]{6}$/.test(list[p].hex)) {
        ok("hex valido em " + list[p].name, false, list[p].hex);
    }
}
ok("sem codigos duplicados", dupes === 0, dupes + " duplicados");
console.log("  " + list.length + " cores Solid Coated carregadas");

// Cada cor da tabela tem de encontrar a si mesma em primeiro lugar com dE 0.
// Este e o teste que pega erro de indice, de parsing ou de ordenacao.
var selfMiss = 0;
var selfWorst = 0;
for (var t = 0; t < list.length; t++) {
    var hx = list[t].hex;
    var selfRgb = [
        parseInt(hx.substring(1, 3), 16),
        parseInt(hx.substring(3, 5), 16),
        parseInt(hx.substring(5, 7), 16)
    ];
    var top = sandbox.nearestPantone(selfRgb, 1)[0];
    if (top.deltaE > selfWorst) selfWorst = top.deltaE;
    // Cores diferentes podem compartilhar o mesmo hex; aceitamos dE 0.
    if (top.deltaE > 1e-9) selfMiss++;
}
ok("toda cor da tabela se acha com dE 0", selfMiss === 0,
    selfMiss + " falhas, pior dE " + selfWorst.toExponential(2));

// ---------------------------------------------------------------------------
console.log("\nnearestPantone - cores de marca conhecidas");
// ---------------------------------------------------------------------------
/*
 * Hex publicado pela marca -> Pantone que a marca declara no manual.
 *
 * O alvo aqui NAO e acertar sempre em primeiro lugar. O hex sRGB que a Pantone
 * publica para uma cor e o hex do dataset divergem (ex.: Orange 021 C e
 * #ff5200 no dataset e #FF6900 no site da Pantone), e varios Pantones vizinhos
 * ficam a menos de 1 de Delta E entre si. Exigir o 1o lugar seria testar o
 * dataset, nao o algoritmo. Exigimos: aparecer entre os 3 primeiros.
 */
var brands = [
    { rgb: [228, 0, 43], expect: "PANTONE 185 C", label: "185 C" },
    { rgb: [0, 51, 160], expect: "PANTONE 286 C", label: "286 C" },
    { rgb: [45, 41, 38], expect: "PANTONE Black C", label: "Black C" },
    { rgb: [83, 86, 90], expect: "PANTONE Cool Gray 11 C", label: "Cool Gray 11 C" },
    { rgb: [0, 156, 222], expect: "PANTONE 2925 C", label: "2925 C" },
    { rgb: [255, 184, 28], expect: "PANTONE 1235 C", label: "1235 C" },
    { rgb: [0, 177, 64], expect: "PANTONE 354 C", label: "354 C" },
    { rgb: [239, 51, 64], expect: "PANTONE Red 032 C", label: "Red 032 C" },
    { rgb: [0, 61, 165], expect: "PANTONE 293 C", label: "293 C" },
    { rgb: [120, 190, 32], expect: "PANTONE 368 C", label: "368 C" },
    { rgb: [95, 37, 159], expect: "PANTONE 268 C", label: "268 C" }
];
var firstPlace = 0;
for (var b = 0; b < brands.length; b++) {
    var top3 = sandbox.nearestPantone(brands[b].rgb, 3);
    var rank = -1;
    for (var k = 0; k < top3.length; k++) {
        if (top3[k].name === brands[b].expect) { rank = k + 1; break; }
    }
    if (rank === 1) firstPlace++;
    ok(
        brands[b].label + " entre os 3 primeiros",
        rank > 0,
        "top3: " + top3[0].name + " " + top3[0].deltaE.toFixed(2) +
        " | " + top3[1].name + " " + top3[1].deltaE.toFixed(2) +
        " | " + top3[2].name + " " + top3[2].deltaE.toFixed(2)
    );
}
console.log("  " + firstPlace + "/" + brands.length + " acertaram em primeiro lugar");
ok("maioria acerta em primeiro lugar", firstPlace >= 8, firstPlace + "/" + brands.length);

// ---------------------------------------------------------------------------
console.log("\nnearestPantone - ordenacao e sanidade estatistica");
// ---------------------------------------------------------------------------
var many = sandbox.nearestPantone([123, 200, 55], 5);
ok("devolve a quantidade pedida", many.length === 5, "" + many.length);
var ordered = true;
for (var m = 1; m < many.length; m++) {
    if (many[m].deltaE < many[m - 1].deltaE) ordered = false;
}
ok("resultado vem ordenado por dE crescente", ordered,
    many.map(function (x) { return x.deltaE.toFixed(2); }).join(" "));
ok("count ausente devolve 1", sandbox.nearestPantone([10, 20, 30]).length === 1);
ok("count invalido nao quebra", sandbox.nearestPantone([10, 20, 30], 0).length === 1);

// O fan deck cobre bem o sRGB, entao cor aleatoria deve achar vizinho proximo.
var rand = 12345;
function nextRand() {
    rand = (rand * 1103515245 + 12345) % 2147483648;
    return rand / 2147483648;
}
var sum = 0, maxD = 0, n = 500;
for (var r = 0; r < n; r++) {
    var probe = [nextRand() * 255, nextRand() * 255, nextRand() * 255];
    var dE = sandbox.nearestPantone(probe, 1)[0].deltaE;
    sum += dE;
    if (dE > maxD) maxD = dE;
}
console.log("  " + n + " cores aleatorias: dE medio " + (sum / n).toFixed(2) + ", maximo " + maxD.toFixed(2));
ok("dE medio de cores aleatorias abaixo de 4", sum / n < 4, (sum / n).toFixed(2));

// ---------------------------------------------------------------------------
console.log("\nConversoes de fallback (sem app.convertSampleColor)");
// ---------------------------------------------------------------------------
ok("CMYK 0,0,0,0 -> branco", sandbox.toHex(sandbox.cmykToRgbNaive([0, 0, 0, 0])) === "#FFFFFF");
ok("CMYK 0,0,0,100 -> preto", sandbox.toHex(sandbox.cmykToRgbNaive([0, 0, 0, 100])) === "#000000");
ok("CMYK 0,100,100,0 -> vermelho", sandbox.toHex(sandbox.cmykToRgbNaive([0, 100, 100, 0])) === "#FF0000");
var backCmyk = sandbox.rgbToCmykNaive([255, 0, 0]);
ok("RGB vermelho -> CMYK 0,100,100,0",
    Math.round(backCmyk[0]) === 0 && Math.round(backCmyk[1]) === 100 &&
    Math.round(backCmyk[2]) === 100 && Math.round(backCmyk[3]) === 0,
    backCmyk.join(","));
var blackCmyk = sandbox.rgbToCmykNaive([0, 0, 0]);
ok("RGB preto nao divide por zero",
    blackCmyk[3] === 100 && !isNaN(blackCmyk[0]), blackCmyk.join(","));

// ---------------------------------------------------------------------------
console.log("\npickTextColor - contraste WCAG sobre a cor");
// ---------------------------------------------------------------------------
ok("preto -> texto branco", sandbox.pickTextColor([0, 0, 0]) === "white");
ok("branco -> texto preto", sandbox.pickTextColor([255, 255, 255]) === "black");
// Amarelo e azul tem brilho aparente parecido mas luminancia bem diferente:
// e o caso que um teste de "escuro?" ingenuo erra.
ok("amarelo forte -> texto preto", sandbox.pickTextColor([255, 220, 0]) === "black",
    sandbox.pickTextColor([255, 220, 0]));
ok("azul 286 C -> texto branco", sandbox.pickTextColor([0, 51, 160]) === "white",
    sandbox.pickTextColor([0, 51, 160]));
ok("vermelho 185 C -> texto branco", sandbox.pickTextColor([228, 0, 43]) === "white",
    sandbox.pickTextColor([228, 0, 43]));
ok("bege claro -> texto preto", sandbox.pickTextColor([214, 199, 166]) === "black",
    sandbox.pickTextColor([214, 199, 166]));

// A escolha tem de ser sempre a de maior contraste, por definicao.
var wrongPicks = 0;
for (var lum = 0; lum < 256; lum += 5) {
    for (var ch = 0; ch < 3; ch++) {
        var probeRgb = [40, 40, 40];
        probeRgb[ch] = lum;
        var L = sandbox.relativeLuminance(probeRgb);
        var better = ((L + 0.05) / 0.05) >= (1.05 / (L + 0.05)) ? "black" : "white";
        if (sandbox.pickTextColor(probeRgb) !== better) wrongPicks++;
    }
}
ok("sempre escolhe a cor de maior contraste", wrongPicks === 0, wrongPicks + " erros");

ok("luminancia do branco e 1", Math.abs(sandbox.relativeLuminance([255, 255, 255]) - 1) < 1e-9);
ok("luminancia do preto e 0", sandbox.relativeLuminance([0, 0, 0]) < 1e-12);

// ---------------------------------------------------------------------------
console.log("\nbentoRowSpans - mosaico sem buraco nem estouro");
// ---------------------------------------------------------------------------
var badSum = 0, badSpan = 0, allSame = true, firstRow = null;
for (var colCount = 1; colCount <= 8; colCount++) {
    for (var rIdx = 0; rIdx < 12; rIdx++) {
        var spans = sandbox.bentoRowSpans(colCount, rIdx);
        var total = 0;
        for (var sp = 0; sp < spans.length; sp++) {
            total += spans[sp];
            if (spans[sp] < 1 || spans[sp] > 2) badSpan++;
        }
        if (total !== colCount) badSum++;
        if (colCount === 4) {
            var asText = spans.join(",");
            if (firstRow === null) firstRow = asText;
            else if (asText !== firstRow) allSame = false;
        }
    }
}
ok("a soma bate com columns em toda combinacao", badSum === 0, badSum + " linhas erradas");
ok("nenhum bloco menor que 1 ou maior que 2 colunas", badSpan === 0, badSpan + " blocos");
ok("as linhas variam entre si (mosaico, nao listras)", allSame === false);
ok("columns = 1 devolve um bloco", sandbox.bentoRowSpans(1, 0).length === 1);
ok("columns = 0 nao gera laco infinito", sandbox.bentoRowSpans(0, 0).length === 1);

var pattern = [];
for (var pr = 0; pr < 6; pr++) pattern.push(sandbox.bentoRowSpans(4, pr).join(""));
console.log("  columns=4, 6 linhas: " + pattern.join(" | "));

var tallCount = 0;
for (var tr = 0; tr < 12; tr++) if (sandbox.bentoRowIsTall(tr)) tallCount++;
ok("linhas altas sao minoria mas existem", tallCount > 0 && tallCount < 12, tallCount + "/12");

// ---------------------------------------------------------------------------
console.log("\nfitTextSize - rotulo cabendo na largura do bloco");
// ---------------------------------------------------------------------------
ok("linha curta mantem o corpo base",
    sandbox.fitTextSize("HEX #FFF", 200, 9, 6) === 9,
    "" + sandbox.fitTextSize("HEX #FFF", 200, 9, 6));

// O caso real que fazia o texto vazar por cima do bloco vizinho.
var longLabel = "PANTONE Neutral Black C  dE 2.5";
var narrow = sandbox.fitTextSize(longLabel, 110 - 24, 9, 6);
ok("rotulo longo em bloco estreito encolhe", narrow < 9, "" + narrow);
ok("nunca encolhe abaixo do minimo", narrow >= 6, "" + narrow);

/*
 * Contrato: o rotulo cabe, A NAO SER que o piso de legibilidade tenha sido
 * atingido. Neste caso (31 caracteres em 86 pt) caberia so a ~5 pt, entao a
 * funcao para em 6 e deixa transbordar de proposito — texto ilegivel numa
 * legenda de cor e pior que texto que encosta na borda. Quando isso incomodar,
 * a saida e menos colunas ou showDeltaE: false, nao um corpo menor.
 */
var fitsAt = function (label, size, width) {
    return label.length * size * 0.55 <= width + 0.5;
};
ok("ou cabe, ou parou no piso",
    fitsAt(longLabel, narrow, 110 - 24) || narrow === 6,
    "corpo " + narrow + ", precisaria de " + (86 / (longLabel.length * 0.55)).toFixed(2));

// Onde o piso NAO e atingido, tem de caber de verdade.
var mid = sandbox.fitTextSize(longLabel, 140, 9, 6);
ok("acima do piso, o encolhido realmente cabe",
    mid > 6 && fitsAt(longLabel, mid, 140), "corpo " + mid);

ok("bloco largo cabe o mesmo rotulo sem encolher",
    sandbox.fitTextSize(longLabel, 238 - 24, 9, 6) === 9,
    "" + sandbox.fitTextSize(longLabel, 238 - 24, 9, 6));

ok("largura absurdamente pequena para no minimo",
    sandbox.fitTextSize(longLabel, 5, 9, 6) === 6,
    "" + sandbox.fitTextSize(longLabel, 5, 9, 6));
ok("largura zero nao quebra", sandbox.fitTextSize(longLabel, 0, 9, 6) === 9);
ok("rotulo vazio nao quebra", sandbox.fitTextSize("", 100, 9, 6) === 9);

// A medida tem de ser a linha MAIS LONGA, nao a primeira nem a ultima.
var multi = "ab\rPANTONE Neutral Black C  dE 2.5\rcd";
ok("mede a linha mais longa do bloco",
    sandbox.fitTextSize(multi, 86, 9, 6) === sandbox.fitTextSize(longLabel, 86, 9, 6),
    sandbox.fitTextSize(multi, 86, 9, 6) + " vs " + sandbox.fitTextSize(longLabel, 86, 9, 6));
ok("longestLineLength ignora os \\r", sandbox.longestLineLength(multi) === longLabel.length,
    sandbox.longestLineLength(multi) + " vs " + longLabel.length);
ok("longestLineLength de linha unica", sandbox.longestLineLength("abcd") === 4);
ok("longestLineLength de string vazia", sandbox.longestLineLength("") === 0);

// ---------------------------------------------------------------------------
console.log("\nautoUnitWidth - coluna se adapta ao rotulo");
// ---------------------------------------------------------------------------
var shortLabels = ["HEX #FFF", "HEX #000"];
ok("rotulos curtos nao encolhem a coluna abaixo do minimo",
    sandbox.autoUnitWidth(shortLabels, 9, 12, 110, 260) === 110,
    "" + sandbox.autoUnitWidth(shortLabels, 9, 12, 110, 260));

var wide = sandbox.autoUnitWidth(["PANTONE Neutral Black C  dE 2.5"], 9, 12, 110, 260);
ok("rotulo longo alarga a coluna", wide > 110, "" + wide);
ok("na coluna alargada o texto cabe no corpo base",
    sandbox.fitTextSize("PANTONE Neutral Black C  dE 2.5", wide - 24, 9, 6) === 9,
    "corpo " + sandbox.fitTextSize("PANTONE Neutral Black C  dE 2.5", wide - 24, 9, 6));

var huge = new Array(200).join("x");
ok("rotulo absurdo para no maximo",
    sandbox.autoUnitWidth([huge], 9, 12, 110, 260) === 260,
    "" + sandbox.autoUnitWidth([huge], 9, 12, 110, 260));
ok("lista vazia devolve o minimo", sandbox.autoUnitWidth([], 9, 12, 110, 260) === 110);
ok("manda o rotulo mais longo da lista, nao o primeiro",
    sandbox.autoUnitWidth(["ab", "PANTONE Neutral Black C  dE 2.5"], 9, 12, 110, 260) === wide);

// ---------------------------------------------------------------------------
console.log("\nbuildLabel - montagem do rotulo");
// ---------------------------------------------------------------------------
function makeRec() {
    return {
        name: "Vermelho da marca",
        hex: "#E4002B",
        rgb: [228, 0, 43],
        cmyk: [0, 100, 81, 4],
        pantone: [
            { name: "PANTONE 185 C", hex: "#EF0027", deltaE: 1.84 },
            { name: "PANTONE 199 C", hex: "#E00031", deltaE: 2.21 }
        ]
    };
}
var cfg = {
    showName: true, showHex: true, showCMYK: true, showRGB: true,
    showPantone: true, showDeltaE: true, maxDeltaE: 10
};

var lines = sandbox.buildLabel(makeRec(), cfg).split("\r");
ok("6 linhas (4 fixas + 2 pantones)", lines.length === 6, lines.length + ": " + lines.join(" / "));
ok("linha 1 e o nome", lines[0] === "Vermelho da marca", lines[0]);
ok("linha 2 e o hex", lines[1] === "HEX #E4002B", lines[1]);
ok("linha 3 e o cmyk arredondado", lines[2] === "CMYK 0 100 81 4", lines[2]);
ok("linha 4 e o rgb", lines[3] === "RGB 228 0 43", lines[3]);
ok("pantone sai limpo, com o dE", lines[4] === "PANTONE 185 C  dE 1.8", lines[4]);
ok("segundo colocado tambem aparece", lines[5] === "PANTONE 199 C  dE 2.2", lines[5]);

// Nenhuma linha pode voltar a sair com til, em nenhuma condicao.
var weak = makeRec();
weak.pantone[0].deltaE = 18;
var weakLines = sandbox.buildLabel(weak, cfg).split("\r");
ok("match fraco tambem sai sem til", weakLines[4] === "PANTONE 185 C  dE 18", weakLines[4]);
var anyTilde = false;
for (var wl = 0; wl < weakLines.length; wl++) {
    if (weakLines[wl].indexOf("~") !== -1) anyTilde = true;
}
ok("nenhum til em lugar nenhum do rotulo", anyTilde === false, weakLines.join(" / "));

var noDe = sandbox.buildLabel(makeRec(), {
    showName: false, showHex: false, showCMYK: false, showRGB: false,
    showPantone: true, showDeltaE: false, maxDeltaE: 10
});
ok("showDeltaE desligado deixa so o codigo",
    noDe === "PANTONE 185 C\rPANTONE 199 C", JSON.stringify(noDe));

// O nome exato de uma spot fica no titulo; a linha de Pantone abaixo continua
// sendo o resultado da busca, que pode cair em outro codigo.
var spotRec = makeRec();
spotRec.name = "PANTONE 185 C";
var spotLines = sandbox.buildLabel(spotRec, cfg).split("\r");
ok("spot color: nome exato fica no titulo", spotLines[0] === "PANTONE 185 C", spotLines[0]);

var minimal = sandbox.buildLabel(makeRec(), {
    showName: false, showHex: true, showCMYK: false, showRGB: false,
    showPantone: false, showDeltaE: true, maxDeltaE: 10
});
ok("flags desligadas removem linhas", minimal === "HEX #E4002B", minimal);

var noPantone = makeRec();
noPantone.pantone = [];
ok("lista de pantone vazia nao gera linha solta",
    sandbox.buildLabel(noPantone, cfg).split("\r").length === 4);
noPantone.pantone = null;
ok("pantone nulo nao quebra",
    sandbox.buildLabel(noPantone, cfg).split("\r").length === 4);

// ---------------------------------------------------------------------------
console.log(
    "\n" + (checks - failures) + "/" + checks + " verificacoes passaram" +
    (failures ? "  (" + failures + " falha(s))" : "")
);
process.exit(failures ? 1 : 0);
