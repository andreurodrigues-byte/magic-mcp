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
    // "auto"      = usa a selecao; se nada estiver selecionado, usa as swatches
    // "selection" = so os objetos selecionados
    // "swatches"  = so o painel Swatches (as selecionadas, ou todas)
    source: "auto",

    includeStrokes: true, // tambem coletar cor de contorno dos objetos

    showName: true, // nome da swatch / spot
    showHex: true,
    showCMYK: true,
    showRGB: false,
    showPantone: true,

    // Quantos Pantones mais proximos listar. Empates dentro de 1-2 de Delta E
    // sao comuns, entao 2 e o padrao: o segundo colocado costuma ser tao
    // defensavel quanto o primeiro. Ver illustrator/README.md.
    pantoneCount: 2,

    // Acima deste Delta E 2000 o match e considerado fraco e recebe "~~".
    // 1 = imperceptivel, 2-3 = perceptivel de perto, >10 = cor claramente outra.
    maxDeltaE: 10,

    columns: 5,
    swatchW: 110,
    swatchH: 110,
    gapX: 18,
    gapY: 26,
    textSize: 9,
    fontName: "", // "" = fonte padrao do documento. Ex.: "Helvetica"

    layerName: "Color Codes"
};

// ============================================================================
// Tabela Pantone Solid Coated: "codigo;RRGGBB" separados por "|".
// Gerada por illustrator/tools/build-pantone-table.cjs — ver aquele arquivo
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

function formatNumbers(values) {
    var out = [];
    for (var i = 0; i < values.length; i++) out[i] = Math.round(values[i]);
    return out.join(" ");
}

/*
 * Monta o texto do rotulo. Separado do desenho para poder ser testado.
 *
 * TODA linha de Pantone leva til, sem excecao, porque toda ela e o resultado de
 * uma busca por proximidade — nunca uma leitura da cor:
 *   "~"   aproximacao dentro de cfg.maxDeltaE
 *   "~~"  aproximacao fraca, confira num leque fisico
 *
 * Isso vale inclusive quando a cor ja e uma spot color. O nome exato dela sai
 * na primeira linha (rec.name); o Pantone mais proximo e calculado a parte e
 * pode perfeitamente cair em outro codigo. Marcar essa linha como exata daria
 * ao usuario um codigo errado com cara de certo.
 */
function buildLabel(rec, cfg) {
    var lines = [];
    if (cfg.showName && rec.name) lines.push(rec.name);
    if (cfg.showHex) lines.push("HEX " + rec.hex);
    if (cfg.showCMYK) lines.push("CMYK " + formatNumbers(rec.cmyk));
    if (cfg.showRGB) lines.push("RGB " + formatNumbers(rec.rgb));

    if (cfg.showPantone && rec.pantone && rec.pantone.length) {
        for (var i = 0; i < rec.pantone.length; i++) {
            var hit = rec.pantone[i];
            var prefix = hit.deltaE > cfg.maxDeltaE ? "~~ " : "~ ";
            lines.push(prefix + hit.name + "  dE " + (Math.round(hit.deltaE * 10) / 10));
        }
    }
    return lines.join("\r");
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
        var norm = normalizeColor(raw[i].color);
        if (!norm) {
            skipped++;
            continue;
        }

        var hex = toHex(norm.rgb);
        var name = norm.spotName || raw[i].name || null;
        var key = hex + "/" + (name || "");
        if (seen[key]) continue;
        seen[key] = true;

        records.push({
            name: name,
            hex: hex,
            rgb: norm.rgb,
            cmyk: norm.cmyk,
            pantone: CONFIG.showPantone ? nearestPantone(norm.rgb, CONFIG.pantoneCount) : null
        });
    }

    return { records: records, skipped: skipped };
}

function makeBlack(doc) {
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
        var c = new CMYKColor();
        c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = 100;
        return c;
    }
    var r = new RGBColor();
    r.red = 0; r.green = 0; r.blue = 0;
    return r;
}

function countLines(text) {
    var n = 1;
    for (var i = 0; i < text.length; i++) if (text.charAt(i) === "\r") n++;
    return n;
}

function draw(doc, records) {
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
    var originX = board[0] + 20;
    var originY = board[1] - 20;

    var black = makeBlack(doc);
    var font = null;
    if (CONFIG.fontName) {
        try { font = app.textFonts.getByName(CONFIG.fontName); } catch (e) {}
    }

    var lineHeight = CONFIG.textSize * 1.3;
    var group = layer.groupItems.add();
    group.name = "Color Codes";

    for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var label = buildLabel(rec, CONFIG);
        var textH = countLines(label) * lineHeight;
        var rowH = CONFIG.swatchH + textH + CONFIG.gapY;

        var col = i % CONFIG.columns;
        var row = Math.floor(i / CONFIG.columns);
        var x = originX + col * (CONFIG.swatchW + CONFIG.gapX);
        var y = originY - row * rowH;

        var card = group.groupItems.add();
        card.name = rec.name || rec.hex;

        var rect = card.pathItems.rectangle(y, x, CONFIG.swatchW, CONFIG.swatchH);
        rect.filled = true;
        rect.stroked = false;

        // Pinta com a cor reconstruida, para bater com os valores exibidos.
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var fc = new CMYKColor();
            fc.cyan = rec.cmyk[0]; fc.magenta = rec.cmyk[1];
            fc.yellow = rec.cmyk[2]; fc.black = rec.cmyk[3];
            rect.fillColor = fc;
        } else {
            var fr = new RGBColor();
            fr.red = rec.rgb[0]; fr.green = rec.rgb[1]; fr.blue = rec.rgb[2];
            rect.fillColor = fr;
        }

        var text = card.textFrames.pointText([x, y - CONFIG.swatchH - CONFIG.textSize - 4]);
        text.contents = label;
        try {
            text.textRange.characterAttributes.size = CONFIG.textSize;
            text.textRange.characterAttributes.leading = lineHeight;
            text.textRange.characterAttributes.fillColor = black;
            if (font) text.textRange.characterAttributes.textFont = font;
        } catch (e) {}
    }

    return group;
}

function main() {
    if (app.documents.length === 0) {
        alert("Abra um documento primeiro.");
        return;
    }

    var doc = app.activeDocument;
    var raw = [];
    var mode = CONFIG.source;

    if (mode === "auto") {
        mode = (doc.selection && doc.selection.length > 0) ? "selection" : "swatches";
    }

    if (mode === "selection") {
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
    alert(msg);
}

// So executa dentro do Illustrator; em Node o arquivo pode ser carregado
// para testar as funcoes de cor.
if (typeof app !== "undefined" && app.documents) {
    main();
}
