/**
 * GerarApresentacao.jsx
 * ---------------------------------------------------------------------------
 * Monta uma apresentacao no Adobe InDesign a partir de uma pasta de projeto
 * contendo um modelo (.indt/.indd), um arquivo conteudo.json e as imagens.
 *
 * Como usar:
 *   1. Organize a pasta do projeto (veja indesign/README.md).
 *   2. No InDesign: Janela > Utilitarios > Scripts.
 *   3. Duplo clique em GerarApresentacao.jsx.
 *   4. Escolha a pasta do projeto quando pedido.
 *
 * Preenchimento: cada pagina e criada a partir de uma pagina-mestre do modelo.
 *   - Por Script Label: o frame no mestre tem rotulo "titulo", "foto" etc.
 *   - Por marcador: o texto no mestre contem {{titulo}}, {{cliente}} etc.
 * Os dois mecanismos funcionam juntos na mesma pagina.
 *
 * Compativel com ExtendScript (ES3) - sem JSON nativo, sem Array.forEach.
 * ---------------------------------------------------------------------------
 */

#target indesign

(function () {

    var VERSAO = "1.0.0";
    var NOME_CONTEUDO = "conteudo.json";

    // -----------------------------------------------------------------------
    // Utilitarios de linguagem (ExtendScript e ES3)
    // -----------------------------------------------------------------------

    function trim(s) {
        return String(s).replace(/^\s+/, "").replace(/\s+$/, "");
    }

    function ehArray(v) {
        return Object.prototype.toString.call(v) === "[object Array]";
    }

    function ehObjeto(v) {
        return v !== null && typeof v === "object" && !ehArray(v);
    }

    function normalizar(s) {
        // Compara rotulos ignorando caixa, acentos e separadores.
        s = String(s).toLowerCase();
        s = s.replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i");
        s = s.replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c");
        return s.replace(/[^a-z0-9]/g, "");
    }

    // -----------------------------------------------------------------------
    // Registro de ocorrencias (vira o relatorio final)
    // -----------------------------------------------------------------------

    var Log = {
        avisos: [],
        erros: [],
        info: [],
        aviso: function (msg) { this.avisos.push(msg); },
        erro: function (msg) { this.erros.push(msg); },
        nota: function (msg) { this.info.push(msg); },
        texto: function () {
            var linhas = [];
            linhas.push("Relatorio - GerarApresentacao " + VERSAO);
            linhas.push(new Date().toString());
            linhas.push("");
            var i;
            for (i = 0; i < this.info.length; i++) { linhas.push("  " + this.info[i]); }
            if (this.avisos.length) {
                linhas.push("");
                linhas.push("AVISOS (" + this.avisos.length + "):");
                for (i = 0; i < this.avisos.length; i++) { linhas.push("  - " + this.avisos[i]); }
            }
            if (this.erros.length) {
                linhas.push("");
                linhas.push("ERROS (" + this.erros.length + "):");
                for (i = 0; i < this.erros.length; i++) { linhas.push("  - " + this.erros[i]); }
            }
            return linhas.join("\r");
        }
    };

    // -----------------------------------------------------------------------
    // Arquivos
    // -----------------------------------------------------------------------

    function lerTexto(arquivo) {
        if (!arquivo.exists) {
            throw new Error("Arquivo nao encontrado: " + arquivo.fsName);
        }
        arquivo.encoding = "UTF-8";
        arquivo.open("r");
        var conteudo = arquivo.read();
        arquivo.close();
        if (conteudo.length && conteudo.charCodeAt(0) === 65279) {
            conteudo = conteudo.substring(1); // remove BOM
        }
        return conteudo;
    }

    function escreverTexto(arquivo, conteudo) {
        arquivo.encoding = "UTF-8";
        arquivo.open("w");
        arquivo.write(conteudo);
        arquivo.close();
    }

    /**
     * ExtendScript nao tem JSON nativo. O arquivo e avaliado como objeto
     * JavaScript, o que tambem permite comentarios // e virgula sobrando.
     */
    function lerConteudo(arquivo) {
        var bruto = trim(lerTexto(arquivo));
        try {
            return eval("(" + bruto + ")");
        } catch (e) {
            throw new Error(
                "Nao consegui ler " + arquivo.name + ": " + e.message +
                "\nVerifique aspas, chaves e virgulas do arquivo."
            );
        }
    }

    function ehCaminhoAbsoluto(caminho) {
        return /^~/.test(caminho) || /^\//.test(caminho) || /^[A-Za-z]:\//.test(caminho);
    }

    function resolverArquivo(pastaBase, caminho) {
        caminho = trim(caminho).replace(/\\/g, "/");
        if (ehCaminhoAbsoluto(caminho)) {
            return new File(caminho);
        }
        return new File(pastaBase.absoluteURI + "/" + encodeURI(caminho));
    }

    /** Busca recursiva por nome de arquivo - permite escrever so "capa.jpg". */
    function procurarPorNome(pasta, nomeAlvo, profundidade) {
        if (profundidade === undefined) { profundidade = 4; }
        if (profundidade < 0) { return null; }
        var itens = pasta.getFiles();
        var i, achado;
        for (i = 0; i < itens.length; i++) {
            if (itens[i] instanceof Folder) { continue; }
            if (normalizar(itens[i].name) === normalizar(nomeAlvo)) { return itens[i]; }
        }
        for (i = 0; i < itens.length; i++) {
            if (itens[i] instanceof Folder) {
                achado = procurarPorNome(itens[i], nomeAlvo, profundidade - 1);
                if (achado) { return achado; }
            }
        }
        return null;
    }

    function localizarImagem(pastaProjeto, caminho, refSlide) {
        var arquivo = resolverArquivo(pastaProjeto, caminho);
        if (arquivo.exists) { return arquivo; }

        var soNome = String(caminho).replace(/\\/g, "/").split("/").pop();
        var alternativa = procurarPorNome(pastaProjeto, soNome);
        if (alternativa) {
            Log.aviso(refSlide + ': imagem "' + caminho + '" nao existe nesse caminho; usei ' +
                      alternativa.fsName);
            return alternativa;
        }
        Log.erro(refSlide + ': imagem nao encontrada -> "' + caminho + '"');
        return null;
    }

    function localizarModelo(pastaProjeto, indicado) {
        if (indicado) {
            var arquivo = resolverArquivo(pastaProjeto, indicado);
            if (!arquivo.exists) {
                throw new Error("Modelo indicado no " + NOME_CONTEUDO + " nao existe: " + indicado);
            }
            return arquivo;
        }
        var candidatos = pastaProjeto.getFiles(function (f) {
            return f instanceof File && /\.(indt|indd)$/i.test(f.name) && !/^~\$/.test(f.name);
        });
        // .indt tem prioridade sobre .indd
        var i;
        for (i = 0; i < candidatos.length; i++) {
            if (/\.indt$/i.test(candidatos[i].name)) { return candidatos[i]; }
        }
        if (candidatos.length) { return candidatos[0]; }
        throw new Error(
            "Nenhum modelo (.indt ou .indd) encontrado na raiz da pasta do projeto.\n" +
            "Coloque o modelo na pasta ou informe o caminho em documento.modelo."
        );
    }

    // -----------------------------------------------------------------------
    // Paginas-mestre
    // -----------------------------------------------------------------------

    function acharMestre(doc, nome) {
        var mestres = doc.masterSpreads;
        var alvo = normalizar(nome);
        var i, m, completo;
        for (i = 0; i < mestres.length; i++) {
            m = mestres[i];
            completo = m.namePrefix + "-" + m.baseName;
            if (normalizar(m.name) === alvo ||
                normalizar(m.baseName) === alvo ||
                normalizar(completo) === alvo ||
                normalizar(m.namePrefix) === alvo) {
                return m;
            }
        }
        return null;
    }

    function listarMestres(doc) {
        var nomes = [];
        for (var i = 0; i < doc.masterSpreads.length; i++) {
            nomes.push(doc.masterSpreads[i].namePrefix + "-" + doc.masterSpreads[i].baseName);
        }
        return nomes.join(", ");
    }

    /** Pagina do mestre correspondente ao lado da pagina do documento. */
    function paginaDoMestre(mestre, pagina) {
        if (mestre.pages.length === 1) { return mestre.pages[0]; }
        try {
            if (pagina.side === PageSideOptions.LEFT_HAND) { return mestre.pages[0]; }
        } catch (e) { /* documento sem paginas espelhadas */ }
        return mestre.pages[mestre.pages.length - 1];
    }

    /** Torna editaveis, na pagina, os itens herdados do mestre. */
    function liberarItensDoMestre(pagina, mestre) {
        var origem = paginaDoMestre(mestre, pagina);
        var itens = origem.pageItems;
        for (var i = itens.length - 1; i >= 0; i--) {
            try {
                itens[i].override(pagina);
            } catch (e) {
                // Itens bloqueados ou nao substituiveis sao ignorados de proposito.
            }
        }
    }

    // -----------------------------------------------------------------------
    // Coleta de itens por rotulo
    // -----------------------------------------------------------------------

    function coletarItens(container, acumulador) {
        var itens = container.pageItems;
        for (var i = 0; i < itens.length; i++) {
            var item = itens[i];
            acumulador.push(item);
            if (item.constructor.name === "Group") {
                coletarItens(item, acumulador);
            }
        }
        return acumulador;
    }

    function itensDaPagina(pagina) {
        return coletarItens(pagina, []);
    }

    function acharPorRotulo(itens, rotulo) {
        var alvo = normalizar(rotulo);
        var encontrados = [];
        for (var i = 0; i < itens.length; i++) {
            var etiqueta = "";
            try { etiqueta = itens[i].label; } catch (e) { etiqueta = ""; }
            if (etiqueta && normalizar(etiqueta) === alvo) {
                encontrados.push(itens[i]);
            }
        }
        return encontrados;
    }

    // -----------------------------------------------------------------------
    // Preenchimento de texto
    // -----------------------------------------------------------------------

    function valorParaTexto(valor) {
        if (valor === null || valor === undefined) { return ""; }
        if (ehArray(valor)) {
            var partes = [];
            for (var i = 0; i < valor.length; i++) { partes.push(valorParaTexto(valor[i])); }
            return partes.join("\r"); // \r = quebra de paragrafo no InDesign
        }
        return String(valor);
    }

    function frameDeTexto(item) {
        if (item.constructor.name === "TextFrame") { return item; }
        // Frame grafico com rotulo de texto: nao da para preencher.
        return null;
    }

    function preencherTexto(item, valor, refSlide, rotulo) {
        var frame = frameDeTexto(item);
        if (!frame) {
            Log.aviso(refSlide + ': o rotulo "' + rotulo + '" nao esta em um frame de texto; ignorado.');
            return false;
        }
        frame.contents = valorParaTexto(valor);
        return true;
    }

    function reduzirCorpo(frame, fator) {
        var paragrafos = frame.parentStory.paragraphs;
        var mudou = false;
        for (var i = 0; i < paragrafos.length; i++) {
            var p = paragrafos[i];
            var corpo = p.pointSize;
            if (typeof corpo === "number" && corpo > 0) {
                p.pointSize = corpo * fator;
                mudou = true;
            }
            var entre = p.leading;
            if (typeof entre === "number" && entre > 0) {
                p.leading = entre * fator;
            }
        }
        return mudou;
    }

    function ajustarSeNaoCouber(frame, refSlide, rotulo) {
        if (!frame.overflows) { return; }
        var tentativas = 0;
        while (frame.overflows && tentativas < 20) {
            if (!reduzirCorpo(frame, 0.96)) { break; }
            tentativas++;
        }
        if (frame.overflows) {
            Log.erro(refSlide + ': o texto de "' + rotulo + '" nao cabe no frame mesmo reduzido.');
        } else if (tentativas > 0) {
            Log.aviso(refSlide + ': reduzi o corpo de "' + rotulo + '" em ' +
                      Math.round((1 - Math.pow(0.96, tentativas)) * 100) + '% para caber.');
        }
    }

    // -----------------------------------------------------------------------
    // Preenchimento de imagem
    // -----------------------------------------------------------------------

    var AJUSTES = {
        preencher: FitOptions.FILL_PROPORTIONALLY,
        conter: FitOptions.PROPORTIONALLY,
        esticar: FitOptions.CONTENT_TO_FRAME,
        frameaoconteudo: FitOptions.FRAME_TO_CONTENT
    };

    function frameGrafico(item) {
        var tipo = item.constructor.name;
        if (tipo === "Image" || tipo === "PDF" || tipo === "EPS" || tipo === "Graphic" || tipo === "WMF") {
            return item.parent; // o rotulo foi posto na imagem, nao no frame
        }
        if (tipo === "Rectangle" || tipo === "Oval" || tipo === "Polygon") {
            return item;
        }
        // TextFrame fica de fora de proposito: colocar imagem nele a ancoraria
        // dentro do texto em vez de preencher o frame.
        return null;
    }

    function preencherImagem(item, spec, pastaProjeto, refSlide, rotulo) {
        var caminho = spec;
        var ajuste = "preencher";
        var opacidade = null;

        if (ehObjeto(spec)) {
            caminho = spec.arquivo || spec.caminho || spec.imagem;
            if (spec.ajuste) { ajuste = spec.ajuste; }
            if (typeof spec.opacidade === "number") { opacidade = spec.opacidade; }
        }
        if (!caminho) {
            Log.erro(refSlide + ': "' + rotulo + '" nao informa o arquivo da imagem.');
            return false;
        }

        var frame = frameGrafico(item);
        if (!frame) {
            Log.aviso(refSlide + ': o rotulo "' + rotulo + '" nao esta em um frame que aceite imagem.');
            return false;
        }

        var arquivo = localizarImagem(pastaProjeto, caminho, refSlide);
        if (!arquivo) { return false; }

        try {
            while (frame.graphics.length) { frame.graphics[0].remove(); }
            frame.place(arquivo);
        } catch (e) {
            Log.erro(refSlide + ': falha ao colocar "' + arquivo.name + '" em "' + rotulo + '": ' + e.message);
            return false;
        }

        var modo = AJUSTES[normalizar(ajuste)];
        if (!modo) {
            Log.aviso(refSlide + ': ajuste "' + ajuste + '" desconhecido em "' + rotulo +
                      '"; usei "preencher".');
            modo = FitOptions.FILL_PROPORTIONALLY;
        }
        try {
            frame.fit(modo);
            if (modo === FitOptions.FILL_PROPORTIONALLY || modo === FitOptions.PROPORTIONALLY) {
                frame.fit(FitOptions.CENTER_CONTENT);
            }
        } catch (e) {
            Log.aviso(refSlide + ': nao consegui ajustar "' + rotulo + '": ' + e.message);
        }

        if (opacidade !== null && frame.graphics.length) {
            try {
                frame.graphics[0].transparencySettings.blendingSettings.opacity = opacidade;
            } catch (e) { /* opacidade e opcional */ }
        }
        return true;
    }

    // -----------------------------------------------------------------------
    // Marcadores {{campo}}
    // -----------------------------------------------------------------------

    function limparPreferenciasDeBusca() {
        app.findTextPreferences = NothingEnum.NOTHING;
        app.changeTextPreferences = NothingEnum.NOTHING;
    }

    function substituirMarcadores(pagina, campos) {
        var itens = itensDaPagina(pagina);
        var chave, valor, i;

        for (chave in campos) {
            if (!campos.hasOwnProperty(chave)) { continue; }
            valor = valorParaTexto(campos[chave]);

            limparPreferenciasDeBusca();
            app.findTextPreferences.findWhat = "{{" + chave + "}}";
            app.changeTextPreferences.changeTo = valor;

            for (i = 0; i < itens.length; i++) {
                if (itens[i].constructor.name !== "TextFrame") { continue; }
                try { itens[i].changeText(); } catch (e) { /* frame sem texto */ }
            }
        }
        limparPreferenciasDeBusca();
    }

    /** Remove marcadores que sobraram, para nao aparecerem no arquivo final. */
    function limparMarcadoresRestantes(pagina, refSlide) {
        var itens = itensDaPagina(pagina);
        var sobraram = [];
        limparPreferenciasDeBusca();
        app.findGrepPreferences = NothingEnum.NOTHING;
        app.changeGrepPreferences = NothingEnum.NOTHING;
        app.findGrepPreferences.findWhat = "\\{\\{[^}]+\\}\\}";
        app.changeGrepPreferences.changeTo = "";

        for (var i = 0; i < itens.length; i++) {
            if (itens[i].constructor.name !== "TextFrame") { continue; }
            try {
                var achados = itens[i].findGrep();
                for (var j = 0; j < achados.length; j++) { sobraram.push(achados[j].contents); }
                itens[i].changeGrep();
            } catch (e) { /* frame sem texto */ }
        }
        app.findGrepPreferences = NothingEnum.NOTHING;
        app.changeGrepPreferences = NothingEnum.NOTHING;

        if (sobraram.length) {
            Log.aviso(refSlide + ": marcadores sem valor foram apagados -> " + sobraram.join(", "));
        }
    }

    // -----------------------------------------------------------------------
    // Montagem de uma pagina
    // -----------------------------------------------------------------------

    function montarPagina(doc, slide, indice, pastaProjeto, config) {
        var refSlide = "Slide " + (indice + 1);
        var nomeLayout = slide.layout || slide.mestre || slide.paginaMestre;

        if (!nomeLayout) {
            Log.erro(refSlide + ': sem "layout" definido; pagina ignorada.');
            return null;
        }

        var mestre = acharMestre(doc, nomeLayout);
        if (!mestre) {
            Log.erro(refSlide + ': pagina-mestre "' + nomeLayout + '" nao existe no modelo. ' +
                     "Disponiveis: " + listarMestres(doc));
            return null;
        }

        var pagina = doc.pages.add(LocationOptions.AT_END);
        pagina.appliedMaster = mestre;
        liberarItensDoMestre(pagina, mestre);

        var itens = itensDaPagina(pagina);
        var chave, alvos, k;

        // 1) Textos por Script Label
        var textos = slide.textos || slide.campos || {};
        for (chave in textos) {
            if (!textos.hasOwnProperty(chave)) { continue; }
            alvos = acharPorRotulo(itens, chave);
            if (!alvos.length) { continue; } // pode ser marcador; tratado adiante
            for (k = 0; k < alvos.length; k++) {
                if (preencherTexto(alvos[k], textos[chave], refSlide, chave) &&
                    config.ajustarTextoQueNaoCabe) {
                    ajustarSeNaoCouber(alvos[k], refSlide, chave);
                }
            }
        }

        // 2) Imagens por Script Label
        var imagens = slide.imagens || {};
        for (chave in imagens) {
            if (!imagens.hasOwnProperty(chave)) { continue; }
            alvos = acharPorRotulo(itens, chave);
            if (!alvos.length) {
                Log.erro(refSlide + ': nenhum frame com o rotulo "' + chave + '" na pagina-mestre "' +
                         nomeLayout + '".');
                continue;
            }
            for (k = 0; k < alvos.length; k++) {
                preencherImagem(alvos[k], imagens[chave], pastaProjeto, refSlide, chave);
            }
        }

        // 3) Marcadores {{campo}} - textos do slide + variaveis globais
        var campos = {};
        for (chave in config.variaveis) {
            if (config.variaveis.hasOwnProperty(chave)) { campos[chave] = config.variaveis[chave]; }
        }
        for (chave in textos) {
            if (textos.hasOwnProperty(chave)) { campos[chave] = textos[chave]; }
        }
        campos.numeroSlide = String(indice + 1);
        substituirMarcadores(pagina, campos);
        limparMarcadoresRestantes(pagina, refSlide);

        // 4) Reajuste final de texto (os marcadores mudaram o conteudo)
        if (config.ajustarTextoQueNaoCabe) {
            var finais = itensDaPagina(pagina);
            for (k = 0; k < finais.length; k++) {
                if (finais[k].constructor.name === "TextFrame" && finais[k].overflows) {
                    var rotulo = finais[k].label || "frame de texto";
                    ajustarSeNaoCouber(finais[k], refSlide, rotulo);
                }
            }
        }

        // 5) Rotulo de identificacao (facilita revisao depois)
        try { pagina.label = "slide-" + (indice + 1) + "|" + nomeLayout; } catch (e) {}

        return pagina;
    }

    // -----------------------------------------------------------------------
    // Fluxo principal
    // -----------------------------------------------------------------------

    function escolherPasta() {
        var pasta = Folder.selectDialog("Selecione a pasta do projeto da apresentacao");
        if (!pasta) { return null; }
        return pasta;
    }

    function lerConfig(dados) {
        var doc = dados.documento || {};
        return {
            modelo: doc.modelo || null,
            nomeSaida: doc.nomeSaida || "apresentacao",
            pastaSaida: doc.pastaSaida || "saida",
            ajustarTextoQueNaoCabe: doc.ajustarTextoQueNaoCabe !== false,
            exportarPDF: doc.exportarPDF === true,
            presetPDF: doc.presetPDF || "[High Quality Print]",
            empacotar: doc.empacotar === true,
            variaveis: dados.variaveis || {}
        };
    }

    function abrirModelo(arquivoModelo) {
        // .indt abre como documento novo sem titulo; .indd abre o proprio arquivo,
        // por isso ele nunca e salvo por cima (usamos "salvar como" na saida).
        return app.open(arquivoModelo, true);
    }

    function removerPaginasOriginais(doc, quantidade) {
        if (quantidade <= 0) { return; }
        if (doc.pages.length <= quantidade) {
            Log.aviso("Nenhuma pagina foi gerada; as paginas originais do modelo foram mantidas.");
            return;
        }
        for (var i = quantidade - 1; i >= 0; i--) {
            try { doc.pages[i].remove(); } catch (e) {
                Log.aviso("Nao consegui remover a pagina original " + (i + 1) + ": " + e.message);
            }
        }
    }

    function garantirPasta(caminhoPasta) {
        var pasta = new Folder(caminhoPasta);
        if (!pasta.exists) { pasta.create(); }
        return pasta;
    }

    function exportarPDF(doc, arquivoPDF, nomePreset) {
        var preset = app.pdfExportPresets.itemByName(nomePreset);
        if (!preset.isValid) {
            Log.aviso('Preset de PDF "' + nomePreset + '" nao existe; usei o primeiro disponivel.');
            preset = app.pdfExportPresets[0];
        }
        doc.exportFile(ExportFormat.PDF_TYPE, arquivoPDF, false, preset);
    }

    function empacotar(doc, pastaSaida, nome) {
        var destino = garantirPasta(pastaSaida.absoluteURI + "/" + encodeURI(nome + "-pacote"));
        doc.packageForPrint(destino, true, true, true, true, true, true, true, false, false);
        return destino;
    }

    function main() {
        if (parseFloat(app.version) < 6) {
            alert("Este script precisa do InDesign CS4 ou superior.");
            return;
        }

        var pastaProjeto = escolherPasta();
        if (!pastaProjeto) { return; }

        var arquivoConteudo = new File(pastaProjeto.absoluteURI + "/" + NOME_CONTEUDO);
        if (!arquivoConteudo.exists) {
            alert("Nao encontrei " + NOME_CONTEUDO + " em:\n" + pastaProjeto.fsName +
                  "\n\nVeja indesign/README.md para a estrutura esperada da pasta.");
            return;
        }

        var dados = lerConteudo(arquivoConteudo);
        if (!dados || !ehArray(dados.slides) || !dados.slides.length) {
            alert(NOME_CONTEUDO + ' precisa ter uma lista "slides" com pelo menos um item.');
            return;
        }

        var config = lerConfig(dados);
        var arquivoModelo = localizarModelo(pastaProjeto, config.modelo);

        var interacaoAnterior = app.scriptPreferences.userInteractionLevel;
        var redrawAnterior = app.scriptPreferences.enableRedraw;
        app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
        app.scriptPreferences.enableRedraw = false;

        var doc = null;
        var salvo = null;
        var pastaSaida = null;

        try {
            doc = abrirModelo(arquivoModelo);
            Log.nota("Modelo: " + arquivoModelo.name);
            Log.nota("Paginas-mestre no modelo: " + listarMestres(doc));

            var paginasIniciais = doc.pages.length;
            var geradas = 0;
            for (var i = 0; i < dados.slides.length; i++) {
                if (montarPagina(doc, dados.slides[i], i, pastaProjeto, config)) { geradas++; }
            }
            removerPaginasOriginais(doc, paginasIniciais);
            Log.nota("Paginas geradas: " + geradas + " de " + dados.slides.length);

            try { doc.links.length && doc.links.everyItem().update(); } catch (e) { /* links ok */ }

            pastaSaida = garantirPasta(
                ehCaminhoAbsoluto(config.pastaSaida)
                    ? config.pastaSaida
                    : pastaProjeto.absoluteURI + "/" + encodeURI(config.pastaSaida)
            );

            salvo = new File(pastaSaida.absoluteURI + "/" + encodeURI(config.nomeSaida + ".indd"));
            doc.save(salvo);
            Log.nota("Documento salvo: " + salvo.fsName);

            if (config.exportarPDF) {
                var pdf = new File(pastaSaida.absoluteURI + "/" + encodeURI(config.nomeSaida + ".pdf"));
                exportarPDF(doc, pdf, config.presetPDF);
                Log.nota("PDF exportado: " + pdf.fsName);
            }
            if (config.empacotar) {
                var pacote = empacotar(doc, pastaSaida, config.nomeSaida);
                Log.nota("Pacote gerado: " + pacote.fsName);
            }

        } catch (e) {
            Log.erro("Interrompido: " + e.message + (e.line ? " (linha " + e.line + ")" : ""));
        } finally {
            app.scriptPreferences.userInteractionLevel = interacaoAnterior;
            app.scriptPreferences.enableRedraw = redrawAnterior;
            limparPreferenciasDeBusca();
        }

        // O relatorio e gravado mesmo quando algo falhou no meio do caminho.
        var destinoRelatorio = pastaSaida || pastaProjeto;
        try {
            escreverTexto(new File(destinoRelatorio.absoluteURI + "/relatorio.txt"), Log.texto());
        } catch (e) { /* sem permissao de escrita: o resumo abaixo ainda aparece */ }

        var resumo = "Apresentacao montada.\n\n" +
                     (salvo ? "Arquivo: " + salvo.fsName + "\n" : "") +
                     "Avisos: " + Log.avisos.length + "   Erros: " + Log.erros.length;
        if (Log.erros.length) {
            resumo += "\n\nPrimeiros erros:\n- " + Log.erros.slice(0, 5).join("\n- ");
        }
        resumo += "\n\nRelatorio completo: " + destinoRelatorio.fsName + "/relatorio.txt";
        alert(resumo);
    }

    main();

})();
