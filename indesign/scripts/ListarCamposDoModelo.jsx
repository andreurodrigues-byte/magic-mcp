/**
 * ListarCamposDoModelo.jsx
 * ---------------------------------------------------------------------------
 * Inspeciona um modelo de apresentacao e mostra, para cada pagina-mestre,
 * quais campos existem: rotulos (Script Label) e marcadores {{campo}}.
 *
 * Gera dois arquivos ao lado do modelo:
 *   - campos-do-modelo.txt   -> relatorio legivel
 *   - conteudo-exemplo.json  -> esqueleto pronto para virar o seu conteudo.json
 *
 * Use este script ANTES de escrever o conteudo.json: ele diz exatamente que
 * nomes o GerarApresentacao.jsx vai procurar.
 * ---------------------------------------------------------------------------
 */

#target indesign

(function () {

    function normalizar(s) {
        s = String(s).toLowerCase();
        s = s.replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i");
        s = s.replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c");
        return s.replace(/[^a-z0-9]/g, "");
    }

    function contem(lista, valor) {
        for (var i = 0; i < lista.length; i++) {
            if (normalizar(lista[i]) === normalizar(valor)) { return true; }
        }
        return false;
    }

    function escreverTexto(arquivo, conteudo) {
        arquivo.encoding = "UTF-8";
        arquivo.open("w");
        arquivo.write(conteudo);
        arquivo.close();
    }

    function coletarItens(container, acumulador) {
        var itens = container.pageItems;
        for (var i = 0; i < itens.length; i++) {
            acumulador.push(itens[i]);
            if (itens[i].constructor.name === "Group") {
                coletarItens(itens[i], acumulador);
            }
        }
        return acumulador;
    }

    function ehFrameDeTexto(item) {
        return item.constructor.name === "TextFrame";
    }

    function marcadoresEm(item) {
        var achados = [];
        if (!ehFrameDeTexto(item)) { return achados; }
        app.findGrepPreferences = NothingEnum.NOTHING;
        app.changeGrepPreferences = NothingEnum.NOTHING;
        app.findGrepPreferences.findWhat = "\\{\\{[^}]+\\}\\}";
        try {
            var resultados = item.findGrep();
            for (var i = 0; i < resultados.length; i++) {
                var bruto = String(resultados[i].contents);
                var nome = bruto.replace(/^\{\{/, "").replace(/\}\}$/, "");
                if (!contem(achados, nome)) { achados.push(nome); }
            }
        } catch (e) { /* frame sem texto */ }
        app.findGrepPreferences = NothingEnum.NOTHING;
        app.changeGrepPreferences = NothingEnum.NOTHING;
        return achados;
    }

    function aspas(s) {
        return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }

    function obterDocumento() {
        if (app.documents.length) { return { doc: app.documents[0], abrimosAqui: false }; }
        var arquivo = File.openDialog("Selecione o modelo (.indt ou .indd)");
        if (!arquivo) { return null; }
        return { doc: app.open(arquivo, true), abrimosAqui: true };
    }

    function main() {
        var alvo = obterDocumento();
        if (!alvo) { return; }

        var doc = alvo.doc;
        var linhas = [];
        var mestresJSON = [];

        linhas.push("Campos do modelo: " + doc.name);
        linhas.push(new Date().toString());
        linhas.push("");

        if (!doc.masterSpreads.length) {
            alert("Este documento nao tem paginas-mestre. Crie uma pagina-mestre por tipo de slide.");
            return;
        }

        for (var m = 0; m < doc.masterSpreads.length; m++) {
            var mestre = doc.masterSpreads[m];
            var nomeMestre = mestre.namePrefix + "-" + mestre.baseName;

            var rotulosTexto = [];
            var rotulosImagem = [];
            var marcadores = [];
            var semRotulo = 0;

            for (var p = 0; p < mestre.pages.length; p++) {
                var itens = coletarItens(mestre.pages[p], []);
                for (var i = 0; i < itens.length; i++) {
                    var item = itens[i];
                    var rotulo = "";
                    try { rotulo = String(item.label || ""); } catch (e) { rotulo = ""; }

                    var achadosMarcador = marcadoresEm(item);
                    for (var k = 0; k < achadosMarcador.length; k++) {
                        if (!contem(marcadores, achadosMarcador[k])) {
                            marcadores.push(achadosMarcador[k]);
                        }
                    }

                    if (!rotulo) {
                        if (item.constructor.name !== "Group") { semRotulo++; }
                        continue;
                    }
                    if (ehFrameDeTexto(item)) {
                        if (!contem(rotulosTexto, rotulo)) { rotulosTexto.push(rotulo); }
                    } else {
                        if (!contem(rotulosImagem, rotulo)) { rotulosImagem.push(rotulo); }
                    }
                }
            }

            linhas.push("Pagina-mestre: " + nomeMestre);
            linhas.push("  layout (use este nome no conteudo.json): " + nomeMestre);
            linhas.push("  textos por rotulo : " + (rotulosTexto.length ? rotulosTexto.join(", ") : "(nenhum)"));
            linhas.push("  imagens por rotulo: " + (rotulosImagem.length ? rotulosImagem.join(", ") : "(nenhum)"));
            linhas.push("  marcadores {{ }}  : " + (marcadores.length ? marcadores.join(", ") : "(nenhum)"));
            if (semRotulo) {
                linhas.push("  " + semRotulo + " item(ns) sem rotulo - sao apenas parte do layout fixo.");
            }
            linhas.push("");

            // Esqueleto JSON deste layout
            var bloco = [];
            bloco.push("    {");
            bloco.push("      " + aspas("layout") + ": " + aspas(nomeMestre) + ",");

            var camposTexto = [];
            for (var t = 0; t < rotulosTexto.length; t++) { camposTexto.push(rotulosTexto[t]); }
            for (var mk = 0; mk < marcadores.length; mk++) {
                if (!contem(camposTexto, marcadores[mk])) { camposTexto.push(marcadores[mk]); }
            }

            var partesTexto = [];
            for (var ct = 0; ct < camposTexto.length; ct++) {
                partesTexto.push("        " + aspas(camposTexto[ct]) + ": " + aspas("..."));
            }
            bloco.push("      " + aspas("textos") + ": {");
            bloco.push(partesTexto.join(",\r"));
            bloco.push("      }" + (rotulosImagem.length ? "," : ""));

            if (rotulosImagem.length) {
                var partesImagem = [];
                for (var ri = 0; ri < rotulosImagem.length; ri++) {
                    partesImagem.push("        " + aspas(rotulosImagem[ri]) + ": " +
                                      aspas("imagens/troque-aqui.jpg"));
                }
                bloco.push("      " + aspas("imagens") + ": {");
                bloco.push(partesImagem.join(",\r"));
                bloco.push("      }");
            }
            bloco.push("    }");
            mestresJSON.push(bloco.join("\r"));
        }

        var esqueleto = [
            "{",
            '  "documento": {',
            '    "modelo": ' + aspas(doc.name) + ",",
            '    "nomeSaida": "apresentacao",',
            '    "pastaSaida": "saida",',
            '    "ajustarTextoQueNaoCabe": true,',
            '    "exportarPDF": false',
            "  },",
            '  "variaveis": {',
            '    "cliente": "Nome do cliente",',
            '    "data": "2026"',
            "  },",
            '  "slides": [',
            mestresJSON.join(",\r"),
            "  ]",
            "}"
        ].join("\r");

        var pastaDestino = doc.saved ? doc.filePath : Folder.desktop;
        var relatorio = new File(pastaDestino.absoluteURI + "/campos-do-modelo.txt");
        var exemplo = new File(pastaDestino.absoluteURI + "/conteudo-exemplo.json");
        escreverTexto(relatorio, linhas.join("\r"));
        escreverTexto(exemplo, esqueleto);

        if (alvo.abrimosAqui) { doc.close(SaveOptions.NO); }

        alert("Inspecao concluida.\n\n" +
              "Relatorio: " + relatorio.fsName + "\n" +
              "Esqueleto: " + exemplo.fsName + "\n\n" +
              "Renomeie o esqueleto para conteudo.json, ajuste os textos e rode GerarApresentacao.jsx.");
    }

    main();

})();
