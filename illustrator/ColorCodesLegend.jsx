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
    // "input"     = abre uma caixa para colar a lista de codigos (RGB, HEX ou
    //               CMYK), com titulos de grupo. Nao precisa ter as cores no
    //               documento. Ver parseColorInput para o formato aceito.
    // "auto"      = usa a selecao; se nada estiver selecionado, usa as swatches
    // "selection" = so os objetos selecionados
    // "swatches"  = so o painel Swatches (as selecionadas, ou todas)
    source: "input",

    includeStrokes: true, // tambem coletar cor de contorno dos objetos

    showName: true, // nome da swatch / spot, no canto superior esquerdo
    uppercaseName: true,
    showHex: true,
    showCMYK: true,
    showRGB: true,
    showPantone: true,

    // Quantos Pantones mais proximos listar. O primeiro vai para o cabecalho do
    // cartao; do segundo em diante viram linhas do bloco de valores. Empates
    // dentro de 1-2 de Delta E sao comuns, entao 2 e util quando a escolha vai
    // para producao — so deixa o cartao mais cheio. Ver illustrator/README.md.
    pantoneCount: 1,

    // Mostra a distancia perceptual junto do codigo: "PANTONE 454 C  dE 2.6".
    //   "auto"  so quando o match for pior que deltaEThreshold (padrao)
    //   true    sempre
    //   false   nunca
    // "auto" deixa o cartao limpo no caso comum e avisa exatamente onde
    // importa: a maioria das cores acha um Pantone a menos de 2 de dE, e
    // carimbar "dE 0.5" em todas so rouba espaco do cartao.
    showDeltaE: "auto",

    // Acima disto o match e fraco o bastante para o dE aparecer no cartao.
    // 1 = imperceptivel, 2-3 = perceptivel lado a lado, >10 = outra cor.
    deltaEThreshold: 2.5,

    // "bento" = cartoes de cantos arredondados sobre um painel, com nome e
    //           Pantone no topo e os valores em duas colunas embaixo
    // "grid"  = grade simples, amostra em cima e rotulo em texto corrido abaixo
    layout: "bento",

    columns: 3,

    /*
     * Proporcoes do cartao.
     *
     * Os numeros abaixo vem de medir uma prancheta de referencia pixel a
     * pixel: cartao de 269x142, padding 15, corpo ~8.3, entrelinha 20,
     * respiro 8 entre cartoes.
     * Normalizado pela largura do cartao:
     *
     *   altura        = largura / 1.89
     *   padding       = 5.6% da largura
     *   corpo         = 3.1% da largura
     *   entrelinha    = 2.4x o corpo   <- o que da o ar de tabela
     *   respiro       = 3% da largura
     *
     * A entrelinha e o que mais muda o resultado: em 1.3x as tres linhas de
     * valor grudam no rodape e o cartao fica apertado; em 2.2x elas respiram.
     */
    swatchW: 260, // no bento, largura de 1 coluna; blocos largos ocupam 2
    swatchH: 137, // 260 / 1.89

    /*
     * Quando o conteudo nao cabe na largura do cartao, o que cede primeiro.
     *
     * O padrao e encolher o texto: a grade regular e o que faz a prancheta ler
     * como sistema, e um nome comprido nao deveria deformar a coluna inteira.
     * So quando o corpo chegaria abaixo de minTextSize o cartao alarga, ate
     * maxSwatchW. (Antes era o contrario, e um unico nome longo inflava tudo.)
     */
    autoWidth: true,
    maxSwatchW: 420,

    // Mosaico: blocos de larguras e alturas variadas, como um bento de verdade.
    // Desligado deixa todos os cartoes do mesmo tamanho, que e o mais comum em
    // guia de marca.
    bentoMosaic: false,

    cornerRadius: 8,

    // Painel claro atras dos cartoes e fundo atras dele. null desliga cada um.
    // Valores em RGB 0-255; num documento CMYK sao convertidos.
    panelColor: [255, 255, 255],
    panelPadding: 19,
    panelRadius: 16,
    backgroundColor: [223, 223, 223],
    backgroundPadding: 18,

    // Contraste minimo (WCAG) entre o texto e a cor do cartao. 4.5 e o criterio
    // AA para texto normal.
    minInkContrast: 4.5,
    gapX: 8,
    gapY: 10, // no bento vale para os dois eixos
    textSize: 8,
    // Corpo minimo. Rotulo que nao cabe na largura do cartao encolhe ate aqui;
    // so entao o cartao alarga (ver autoWidth).
    minTextSize: 6,
    fontName: "", // "" = fonte padrao do documento. Ex.: "Helvetica"

    // Entrelinha, como fator do corpo. No bento as linhas de valor sao uma
    // tabela e pedem ar; no grid sao um paragrafo e pedem o contrario.
    bentoLineSpacing: 2.4,
    gridLineSpacing: 1.35,

    // Só no bento: altura das linhas altas do mosaico, como fator de swatchH.
    bentoTallFactor: 1.5,
    // Só no bento: respiro entre a borda do cartao e o texto, em pontos.
    bentoPadding: 15,

    // Titulos de grupo ("Principais", "Secundarias").
    groupHeadingSize: 13,
    groupHeadingGap: 10, // do titulo ate a primeira linha de cartoes
    groupGapY: 30,       // entre o fim de um grupo e o titulo do proximo
    uppercaseGroup: true,

    layerName: "Color Codes"
};

// ============================================================================
// Tabela Pantone Solid Coated: "codigo;RRGGBB" separados por "|".
// Gerada por illustrator/tools/build-pantone-table.cjs — ver aquele arquivo
// para a origem dos dados e o porque de o match usar hex, e nao Lab medido.
// ============================================================================
var PANTONE_TABLE = "Yellow C;FFDC00|Yellow 012 C;FFD600|Orange 021 C;FF5200|Warm Red C;FF4537|Red 032 C;FA353E|Rubine Red C;D80057|Rhodamine Red C;E61995|Purple C;BC31BA|Violet C;290097|Blue 072 C;001A9E|Reflex Blue C;001D89|Process Blue C;0084CB|Green C;00A888|Black C;2D2926|Yellow 0131 C;FAEEA3|Red 0331 C;FFAFBB|Magenta 0521 C;F3B3DC|Violet 0631 C;BC9DDE|Blue 0821 C;62D0EB|Green 0921 C;97E6D9|Black 0961 C;A0978E|801 C;0099CF|802 C;50D335|803 C;FFE700|804 C;FFAB4F|805 C;FF7376|806 C;FF46B3|807 C;ED34C0|871 C;88754F|872 C;89714E|873 C;8A6D4B|874 C;8F6F4F|875 C;8B674F|876 C;90634B|877 C;898D8F|Medium Yellow C;FFD800|Bright Orange C;FF6000|Bright Red C;FF3B1D|Strong Red C;D70054|Pink C;DC2D96|Medium Purple C;3F0B8C|Dark Blue C;002B9B|Medium Blue C;0083CB|Bright Green C;00AD8F|Neutral Black C;222222|100 C;FFE964|101 C;FFE84C|102 C;FFE200|103 C;CEA800|104 C;B79700|105 C;8F7928|7401 C;FCE0A6|7402 C;F4D799|7403 C;F7D385|7404 C;FFD844|7405 C;FCCC00|7406 C;FCC200|7407 C;D39F53|106 C;FFE34A|107 C;FFE028|108 C;FFDA00|109 C;FFD000|110 C;E4A900|111 C;B28900|112 C;A48315|113 C;FFDF55|114 C;FFDC43|115 C;FFD82A|116 C;FFCC00|117 C;D29600|118 C;B48400|119 C;8F7323|127 C;FDDB6F|128 C;FED351|129 C;FFCE42|130 C;FEA700|131 C;D68900|132 C;A87300|133 C;71561C|1205 C;FFDF8F|1215 C;FFD774|1225 C;FFC747|1235 C;FFB71F|1245 C;CF9216|1255 C;B48420|1265 C;8E6B26|120 C;FFD966|121 C;FFD659|122 C;FFD043|123 C;FFC62F|124 C;F4A900|125 C;BD8400|126 C;A17613|7548 C;FFC600|7549 C;FFB500|7550 C;D99000|7551 C;BB7E00|7552 C;77531D|7553 C;5E4523|7554 C;4D3D2B|7555 C;DB9E17|7556 C;BE8B21|7557 C;A67C25|7558 C;9C7127|7559 C;956A2A|7560 C;82622F|7561 C;705C35|134 C;FFD170|135 C;FFC55A|136 C;FFBE40|137 C;FFA300|138 C;E77C00|139 C;B66D05|140 C;79531D|1345 C;FFCF87|1355 C;FFC56F|1365 C;FFB44A|1375 C;FF9E1C|1385 C;DE7800|1395 C;9F5F17|1405 C;734B1E|141 C;FCC65E|142 C;FDBC4B|143 C;FCB237|144 C;F98A00|145 C;D97E00|146 C;AF6C13|147 C;765B2B|7408 C;FFBD00|7409 C;FCB227|7410 C;FFAE76|7411 C;F0A45E|7412 C;DA8234|7413 C;E78434|7414 C;C86D17|7562 C;C39B61|7563 C;DF9A2E|7564 C;E48A06|7565 C;D47A24|7566 C;B56433|7567 C;8F5330|7568 C;7C5035|7569 C;E08827|7570 C;DD822D|7571 C;CE7D32|7572 C;BD7133|7573 C;AE652C|7574 C;A46A38|7575 C;885D32|712 C;FFC99B|713 C;FFBE87|714 C;FFAA63|715 C;FF8E2C|716 C;F37700|717 C;DC5F00|718 C;C64E00|148 C;FFCB8C|149 C;FFC27B|150 C;FFB25B|151 C;FF8200|152 C;EF7200|153 C;C66B13|154 C;A15A1A|155 C;F7D0A0|156 C;F8BC7E|157 C;F79F55|158 C;F47624|159 C;D65E15|160 C;A9551D|161 C;653D21|1485 C;FFAE61|1495 C;FF9018|1505 C;FF6B00|1525 C;C14800|1535 C;9A4609|1545 C;693818|1555 C;FFB990|1565 C;FFA169|1575 C;FF8030|1585 C;FF6C0F|1595 C;E06016|1605 C;AD5522|1615 C;914820|162 C;FFBE9F|163 C;FF9E6D|164 C;FF8040|165 C;FF681C|166 C;EC5300|167 C;C6541B|168 C;78391D|7576 C;E4854F|7577 C;E97D3C|7578 C;E56B2F|7579 C;E55829|7580 C;C85130|7581 C;8B4A33|7582 C;6B4736|1625 C;FFA48A|1635 C;FF8E6C|1645 C;FF6C37|1655 C;FF4E00|1665 C;E54600|1675 C;B0441D|1685 C;893A20|169 C;FFB4AB|170 C;FF8873|171 C;FF5E36|172 C;FF4810|173 C;D7461E|174 C;9C3920|175 C;6F3628|7583 C;CE612E|7584 C;C45726|7585 C;B85B38|7586 C;A65230|7587 C;994B2E|7588 C;804C36|7589 C;604739|7590 C;D9B49F|7591 C;C97C5A|7592 C;B95434|7593 C;A5422C|7594 C;823A2D|7595 C;703C2F|7596 C;603C31|7597 C;DB4222|7598 C;C54829|7599 C;BB3D25|7600 C;933F2B|7601 C;88422C|7602 C;804A31|7603 C;6B4230|7604 C;E6D5D4|7605 C;E6BAB4|7606 C;DD928A|7607 C;CA6D61|7608 C;AB483D|7609 C;883A34|7610 C;6D3432|7611 C;E1BCB1|7612 C;CF9A8E|7613 C;C18A7F|7614 C;A77F74|7615 C;8A6761|7616 C;6D4C4C|7617 C;5A3D3E|7520 C;EFBFB0|7521 C;C79B84|7522 C;BC6A55|7523 C;B05D57|7524 C;AA5347|7525 C;A16850|7526 C;8F3A1A|489 C;F2C3B3|488 C;F3B9A9|487 C;F3A694|486 C;F2907C|485 C;E5271A|484 C;A23224|483 C;6A3025|176 C;FFB3BA|177 C;FF838A|178 C;FF5B5A|179 C;E93E2E|180 C;C63D32|181 C;86332D|1765 C;FFA5B4|1775 C;FF8FA0|1785 C;FF4B5C|1788 C;F82934|1795 C;DB292D|1805 C;B6292D|1815 C;812728|1767 C;FFB0BF|1777 C;FF667D|1787 C;FE394A|1797 C;D3343A|1807 C;AA3539|1817 C;673434|7618 C;CF6D4F|7619 C;CA4B37|7620 C;C1302B|7621 C;B42227|7622 C;9A272B|7623 C;912A2A|7624 C;872E2D|7625 C;EC513E|7626 C;CF3824|7627 C;AE2C28|7628 C;A52C2A|7629 C;713431|7630 C;663330|7631 C;5A2E2D|7415 C;EDB9A8|7416 C;EF6954|7417 C;EC4D39|7418 C;D4555A|7419 C;B44D59|7420 C;A12440|7421 C;6A1D32|182 C;FEBCCB|183 C;FF9DB2|184 C;FF5573|185 C;EF0027|186 C;D2142B|187 C;AD1C2C|188 C;7B252E|196 C;EFC7CE|197 C;EE9CAE|198 C;E94560|199 C;E00031|200 C;C4092E|201 C;A52234|202 C;8C2632|189 C;FDA5BB|190 C;FD7798|191 C;F8456D|192 C;EF0543|193 C;C8123C|194 C;A12942|195 C;7C303F|1895 C;F8B7CD|1905 C;FA9CBA|1915 C;F74D7F|1925 C;EB004B|1935 C;CE003B|1945 C;AD0E3C|1955 C;901737|705 C;F7DBE0|706 C;F9CFD7|707 C;FDB6C4|708 C;FE92A4|709 C;F76278|710 C;E94050|711 C;D42E2E|698 C;F4D5D7|699 C;F7C3CC|700 C;F7ADB9|701 C;EB8799|702 C;D95D72|703 C;BF3C4A|704 C;A42C2E|203 C;EFB4CB|204 C;EE82A9|205 C;E8467A|206 C;D90035|207 C;AD0033|208 C;8C2041|209 C;73273C|210 C;FCA1C8|211 C;FA81B4|212 C;F65396|213 C;EB2476|214 C;D61A66|215 C;B11B58|216 C;812446|7422 C;F6CED4|7423 C;E66486|7424 C;E84A83|7425 C;BC2854|7426 C;AB153D|7427 C;9F1A2E|7428 C;6E2C3D|7632 C;D7C9CB|7633 C;C7A3A7|7634 C;C76884|7635 C;CE3662|7636 C;C5204A|7637 C;972F46|7638 C;842D40|217 C;ECBEDC|218 C;EA6EB0|219 C;E21E82|220 C;AD004E|221 C;970247|222 C;701E45|7639 C;966D73|7640 C;994054|7641 C;942D48|7642 C;772F49|7643 C;6A2E44|7644 C;5A2D40|7645 C;522B3A|223 C;F197CE|224 C;EF72BC|225 C;E52493|226 C;D8006D|227 C;B00060|228 C;8D1356|229 C;692345|230 C;F6A8D6|231 C;F57BC4|232 C;EE44AA|233 C;CC007B|234 C;A60064|235 C;871354|670 C;ECD3E2|671 C;E8BCD8|672 C;E2A1C8|673 C;DC87BA|674 C;CB5999|675 C;B42872|676 C;9C0550|677 C;E7CEDC|678 C;E4C8D8|679 C;E0BED2|680 C;CB96B5|681 C;B36C95|682 C;9D4978|683 C;7F2954|684 C;E5C7D4|685 C;DDB7C9|686 C;D2A2B9|687 C;C085A3|688 C;AA6589|689 C;8B3D66|690 C;642340|510 C;EEBFCA|509 C;EAB5C3|508 C;E7ABBB|507 C;D794A9|506 C;87364D|505 C;722E3E|504 C;592A32|7429 C;E5BCCC|7430 C;DFAABF|7431 C;CD809E|7432 C;BB5C80|7433 C;AD3A63|7434 C;A03359|7435 C;8B2750|691 C;ECCED0|692 C;E6BEC3|693 C;DBA3AB|694 C;C88590|695 C;B86C7A|696 C;9C4956|697 C;8D3D46|496 C;F5C7CF|495 C;F3BEC8|494 C;ECA4B1|493 C;DF8897|492 C;943436|491 C;833234|490 C;5F2B2C|503 C;EBC5C7|502 C;E7BCC1|501 C;DCA6AD|500 C;C8878E|499 C;7D4039|498 C;6C3934|497 C;53302D|5035 C;E2C2C3|5025 C;DDB8BB|5015 C;CEA2A6|5005 C;B27D82|4995 C;9F6269|4985 C;8A4C52|4975 C;412020|236 C;F2A9DC|237 C;EE89CF|238 C;E762BD|239 C;DF45AF|240 C;C93299|241 C;B22083|242 C;82265E|2365 C;F0BBE0|2375 C;E47ACC|2385 C;D840B3|2395 C;CC059F|2405 C;B3008C|2415 C;A1037C|2425 C;860763|243 C;EBB9E3|244 C;E69DDB|245 C;DE81D2|246 C;CA2EAF|247 C;BE23A2|248 C;A7228E|249 C;822B6B|7646 C;A96E87|7647 C;AD3E72|7648 C;9E2165|7649 C;8E1E60|7650 C;742456|7651 C;6C2C5B|7652 C;602851|250 C;E7BBE4|251 C;DD9DDE|252 C;CA67CE|253 C;AD25AB|254 C;992596|255 C;73266C|517 C;ECC7DF|516 C;E6C0DD|515 C;E2AED6|514 C;D38EC7|513 C;91398C|512 C;833675|511 C;622E50|7436 C;EEDBEA|7437 C;CCAED0|7438 C;D59FD7|7439 C;B289B9|7440 C;A278A6|7441 C;9B60C0|7442 C;9143BC|2562 C;D6AAE3|2572 C;C78DDB|2582 C;AA54C5|2592 C;9830B4|2602 C;85229B|2612 C;762982|2622 C;653265|7653 C;958794|7654 C;A3799C|7655 C;A25C94|7656 C;903D7F|7657 C;6F2D62|7658 C;6B355F|7659 C;5E3753|524 C;D5C2D8|523 C;C9B2D0|522 C;BA9DC5|521 C;A480B2|520 C;63316C|519 C;59325F|518 C;4B3048|5245 C;DCCDD4|5235 C;D1BEC7|5225 C;C6B1BC|5215 C;B096A5|5205 C;86657A|5195 C;674459|5185 C;4B3141|5175 C;D9C8D1|5165 C;D4C0CD|5155 C;C0A5B8|5145 C;9C7792|5135 C;805575|5125 C;6B3C5E|5115 C;532B44|531 C;DFC9E7|530 C;D6B9E4|529 C;C8A3DD|528 C;B282D0|527 C;7A37A6|526 C;6D338A|525 C;562E5F|256 C;D6BFDD|257 C;C6A2CE|258 C;8B4A98|259 C;6C2576|260 C;642967|261 C;5D2A5E|262 C;52294E|2563 C;CAA4D8|2573 C;B686CA|2583 C;9E61B4|2593 C;81379A|2603 C;6E2681|2613 C;652374|2623 C;5E2467|7660 C;9891A4|7661 C;8D6E97|7662 C;7A4382|7663 C;693376|7664 C;623578|7665 C;5D386E|7666 C;5B4E63|2567 C;BEA2D9|2577 C;A27DC9|2587 C;7C4BAE|2597 C;53178A|2607 C;491476|2617 C;421367|2627 C;391452|263 C;D6C6E6|264 C;BEA8E2|265 C;8867CC|266 C;6942BC|267 C;532C9E|268 C;522F82|269 C;4E2F6D|2635 C;C1B5E3|2645 C;A698DB|2655 C;8C7BD2|2665 C;705BC5|2685 C;210770|2695 C;291C46|270 C;AFB5DF|271 C;8D96D2|272 C;6876C0|273 C;10185E|274 C;141850|275 C;181947|276 C;1F1D35|2705 C;9FA5E0|2715 C;7E87D6|2725 C;5260C6|2735 C;000389|2745 C;030F70|2755 C;0F1561|2765 C;171846|7667 C;697CA1|7668 C;616F9F|7669 C;595F9B|7670 C;4D5394|7671 C;484889|7672 C;434283|7673 C;4C5586|7443 C;DCDAE8|7444 C;B3B8DC|7445 C;A4A3C3|7446 C;8087CA|7447 C;5A4976|7448 C;4B384C|7449 C;42273A|7674 C;838CB4|7675 C;7780AB|7676 C;7067A0|7677 C;6B5291|7678 C;63498D|7679 C;503F81|7680 C;4D3377|663 C;E5E1E7|664 C;E0DBE3|665 C;C5BCD0|666 C;9F92B1|667 C;796A91|668 C;5E4D79|669 C;3C2C55|5315 C;D8D7DF|5305 C;C5C4D3|5295 C;B1B1C4|5285 C;8A89A5|5275 C;555578|5265 C;3B3B60|5255 C;1A1A34|538 C;C4CFDA|537 C;B9C7D7|536 C;9EB2C9|535 C;8A9FBD|534 C;07365D|533 C;1A2A44|532 C;1B1F2A|7541 C;D9E0E3|7542 C;A3BBC3|7543 C;96A4AE|7544 C;748692|7545 C;3E5464|7546 C;213747|7547 C;101E29|552 C;B6D2DD|551 C;A0C6D3|550 C;87B8CA|549 C;63A3B9|548 C;003C4C|547 C;00303C|546 C;012A31|5455 C;BDCED7|5445 C;B5C8D3|5435 C;A3BBC9|5425 C;7698AC|5415 C;547E96|5405 C;49758B|5395 C;031F2C|642 C;D0DDE7|643 C;C3D5E4|644 C;96B8D3|645 C;74A1C5|646 C;518BB4|647 C;006192|648 C;002E5D|649 C;DAE2E9|650 C;CDD9E6|651 C;A2BCD6|652 C;759BC1|653 C;166295|654 C;003B70|655 C;002654|656 C;DCE4ED|657 C;C5D8EB|658 C;ABC9E8|659 C;6CA5DC|660 C;027FC9|661 C;003894|662 C;001F70|7450 C;BAC5DB|7451 C;7CABE3|7452 C;7195DD|7453 C;6DA6DE|7454 C;548EB5|7455 C;0C5FAD|7456 C;526FB2|2706 C;C8D3EB|2716 C;96AFE4|2726 C;155FC6|2736 C;002CA9|2746 C;00248E|2756 C;00236C|2766 C;001D4D|2708 C;B3CCEA|2718 C;3C8ADA|2728 C;004BBA|2738 C;00158C|2748 C;001E70|2758 C;002161|2768 C;001E48|2707 C;BFD6EE|2717 C;A0C6EE|2727 C;0080E2|2747 C;001F72|2757 C;002160|2767 C;01294B|277 C;A5CAE9|278 C;7EB9E8|279 C;008FDE|280 C;002469|281 C;00215B|282 C;001F42|283 C;87C1E9|284 C;57ACE5|285 C;0073CE|286 C;0037A0|287 C;003387|288 C;002E72|289 C;002340|7681 C;8FA9CB|7682 C;5C87B8|7683 C;296EA9|7684 C;1A5F9D|7685 C;005797|7686 C;005091|7687 C;004489|545 C;C3DAE8|544 C;BAD5E7|543 C;9EC7E2|542 C;70AFD5|541 C;003D71|540 C;003057|539 C;00263A|290 C;B4D9EB|291 C;91CBEC|292 C;51B3E7|293 C;0040A5|294 C;00306D|295 C;002955|296 C;001C2C|2905 C;82C8E9|2915 C;47B5E6|2925 C;009CDE|2935 C;0058B8|2945 C;004D98|2955 C;003965|2965 C;00263E|297 C;5EC5E9|298 C;00B6E6|299 C;00A3E1|300 C;005FB9|301 C;004B88|302 C;003B5D|303 C;002A3A|7688 C;2198CB|7689 C;008FC2|7690 C;0076A9|7691 C;006298|7692 C;005687|7693 C;004976|7694 C;00426A|2975 C;8FD6EB|2985 C;3AC2E8|2995 C;00A8E1|3005 C;0077C8|3015 C;00629C|3025 C;004F72|3035 C;003E52|7695 C;74A7BC|7696 C;5999AF|7697 C;4287A1|7698 C;35738D|7699 C;27657F|7700 C;005B7E|7701 C;005777|7457 C;B7DCE7|7458 C;66B1C9|7459 C;2798B5|7460 C;0084C1|7461 C;007DBB|7462 C;00558C|7463 C;002B49|304 C;91DAE9|305 C;39CAE9|306 C;00B4E3|307 C;006BA7|308 C;00577D|309 C;003B49|635 C;9DDAE9|636 C;7FD3E7|637 C;27C2E1|638 C;00AED8|639 C;0094C9|640 C;0081BB|641 C;0066A1|7702 C;2DA8C6|7703 C;009BBE|7704 C;0084AD|7705 C;006F97|7706 C;006A8E|7707 C;00607F|7708 C;005671|628 C;B4DDE2|629 C;94D2DE|630 C;6BC4D6|631 C;11B0C9|632 C;0092B2|633 C;007297|634 C;005E83|310 C;56D0E5|311 C;00C2DF|312 C;00A8CF|313 C;0090BE|314 C;007EA5|315 C;006680|316 C;004751|3105 C;55D1E1|3115 C;00BFD6|3125 C;00ACC9|3135 C;008BAC|3145 C;00758D|3155 C;006173|3165 C;004E5A|7709 C;57B1BD|7710 C;00A6B6|7711 C;0096AA|7712 C;00849C|7713 C;007B8B|7714 C;007581|7715 C;006169|317 C;ACE3E4|318 C;7EDAE0|319 C;00CAD4|320 C;0099A9|321 C;008A97|322 C;007179|323 C;005E63|7464 C;9DD0CB|7465 C;33BFAE|7466 C;00AEBC|7467 C;00A1B0|7468 C;007398|7469 C;005F86|7470 C;005970|7471 C;75DBD5|7472 C;53B7B3|7473 C;14978B|7474 C;007582|7475 C;427A7C|7476 C;005157|7477 C;1B4C5A|5523 C;B5CED0|5513 C;A8C7CA|5503 C;90B7BC|5493 C;7AA8AF|5483 C;47868E|5473 C;005D67|5463 C;01272E|7716 C;009490|7717 C;00837E|7718 C;007474|7719 C;006C69|7720 C;00625C|7721 C;005D5E|7722 C;005052|324 C;97DADA|325 C;58CBCA|326 C;00B0AB|327 C;008476|328 C;007168|329 C;00665F|330 C;00524C|3242 C;65DAD6|3252 C;00D0CB|3262 C;00BCB6|3272 C;00A19C|3282 C;00827B|3292 C;005851|3302 C;004B46|3245 C;72DED4|3255 C;00D3C6|3265 C;00C4B4|3275 C;00B09C|3285 C;009484|3295 C;007667|3305 C;004D43|3248 C;68CBBA|3258 C;3EC3B2|3268 C;00A98F|3278 C;009879|3288 C;008065|3298 C;006853|3308 C;004539|566 C;B6DCD3|565 C;9DD5CB|564 C;7FC8BE|563 C;62BAB0|562 C;006E64|561 C;00584E|560 C;1A3C34|573 C;B2E2D9|572 C;A1DED4|571 C;92DACF|570 C;62C9BC|569 C;00806F|568 C;006B5C|567 C;133E35|559 C;AEC9B9|558 C;9BBDAB|557 C;87AF9B|556 C;71A088|555 C;2C7051|554 C;235A41|553 C;2A4635|5595 C;BFCDC3|5585 C;A6BDB2|5575 C;91ACA1|5565 C;7D9C91|5555 C;5A7F72|5545 C;41685C|5535 C;163029|5665 C;BBC5BA|5655 C;B1BCB0|5645 C;A4B1A4|5635 C;95A496|5625 C;728474|5615 C;607361|5605 C;23372C|5527 C;BCC8C5|5517 C;B1C0BD|5507 C;9DAFAC|5497 C;829896|5487 C;5D7875|5477 C;3E5C58|5467 C;183330|621 C;D1E0D8|622 C;B6CDC3|623 C;99B9AD|624 C;769E91|625 C;4D7F71|626 C;245B4E|627 C;11312B|331 C;A3E5D9|332 C;85E1D2|333 C;20D9C3|334 C;009479|335 C;007A62|336 C;006451|337 C;8DD4BE|338 C;6ACCB3|339 C;00B08A|340 C;009461|341 C;007854|342 C;006548|343 C;0E5540|7723 C;4FA586|7724 C;00936E|7725 C;008557|7726 C;00794D|7727 C;006D46|7728 C;006647|7729 C;005645|3375 C;74DFC1|3385 C;3DD5AF|3395 C;00C08C|3405 C;00AB6B|3415 C;00754B|3425 C;006243|3435 C;124735|344 C;A2D8B4|345 C;92D5AE|346 C;72CA9A|347 C;009848|348 C;008240|349 C;0B6839|350 C;2E5135|351 C;A2E2BA|352 C;8EE1B2|353 C;7FDEA9|354 C;00AE45|355 C;00943D|356 C;007836|357 C;215633|7478 C;99E2C0|7479 C;25CD7F|7480 C;00BC72|7481 C;00B454|7482 C;009C50|7483 C;275C39|7484 C;005640|7730 C;4E9362|7731 C;29864B|7732 C;007841|7733 C;006E43|7734 C;296041|7735 C;38563C|7736 C;395543|7737 C;72A33D|7738 C;4FA043|7739 C;399945|7740 C;408F42|7741 C;488641|7742 C;4D763E|7743 C;46683E|358 C;B2DA93|359 C;A7D686|360 C;75C04E|361 C;4EAD30|362 C;589C33|363 C;538B2E|364 C;4F752B|7485 C;D3DDBC|7486 C;C2DF95|7487 C;94DB68|7488 C;7FD44F|7489 C;7AA852|7490 C;78974C|7491 C;7E853D|365 C;C9DF8B|366 C;BEDB7B|367 C;ACD461|368 C;81BC28|369 C;6CA516|370 C;6C8B1F|371 C;586124|372 C;DBEA90|373 C;D5E882|374 C;CDE66F|375 C;9FD506|376 C;8CBB00|377 C;80980B|378 C;5D611E|580 C;C9D5A6|579 C;C2D09C|578 C;BDCD96|577 C;AFC281|576 C;809B4D|575 C;6D803C|574 C;515A32|5807 C;D4D1AC|5797 C;CAC79C|5787 C;BFBC8C|5777 C;A7A46A|5767 C;8F8C4C|5757 C;72702F|5747 C;40441F|5875 C;D7CD9F|5865 C;D1C694|5855 C;C5BA88|5845 C;B5A86F|5835 C;A69859|5825 C;8F803E|5815 C;595025|5803 C;C6C6A9|5793 C;B7B896|5783 C;A8A984|5773 C;8E8F66|5763 C;787A4D|5753 C;626639|5743 C;414728|7492 C;C6CA82|7493 C;C0C394|7494 C;9EAE89|7495 C;969840|7496 C;7C8720|7497 C;7D7157|7498 C;5F6137|7744 C;C4BB1E|7745 C;B3AB28|7746 C;A09A33|7747 C;8F8B33|7748 C;827F36|7749 C;777238|7750 C;696536|379 C;ECE66A|380 C;E5E246|381 C;D8DA00|382 C;CFD400|383 C;B1AC00|384 C;9C9200|385 C;7D7022|386 C;F3EA6D|387 C;EEE73A|388 C;EBE52A|389 C;DADD00|390 C;BEBC00|391 C;A19400|392 C;887908|587 C;EBE38F|586 C;E9E07E|585 C;E4DD72|584 C;DCD558|583 C;C1BD1A|582 C;968B17|581 C;675C21|393 C;F9EA76|394 C;F8E83E|395 C;F7E623|396 C;EBDE00|397 C;C8B700|398 C;B5A300|399 C;A79100|3935 C;FDE85F|3945 C;FEE400|3955 C;FBDE00|3965 C;F9DB00|3975 C;C4A500|3985 C;A18603|3995 C;6D5C21|600 C;F8E99E|601 C;F8E892|602 C;F9E67D|603 C;F8DF4E|604 C;F5D92A|605 C;ECCB00|606 C;D9B400|607 C;F2E39B|608 C;F1E088|609 C;EFDC79|610 C;EAD357|611 C;E1C62B|612 C;CEAF00|613 C;BB9A00|461 C;F0DE98|460 C;EDD680|459 C;E7CB65|458 C;E2C558|457 C;C19C1D|456 C;AA8D2C|455 C;6E5A25|614 C;E2D49B|615 C;DCCD8E|616 C;D7C784|617 C;C7B463|618 C;B39D3E|619 C;A6902C|620 C;907A1C|7751 C;D3B44E|7752 C;D8AF27|7753 C;C99F22|7754 C;A7852B|7755 C;8F7531|7756 C;776636|7757 C;6B5D34|7758 C;DEC112|7759 C;CDB100|7760 C;98832E|7761 C;797038|7762 C;61633A|7763 C;5B5B3C|7764 C;565436|7765 C;C4B128|7766 C;BDA824|7767 C;B19C31|7768 C;937E36|7769 C;746135|7770 C;665939|7771 C;504934|4545 C;DACAA0|4535 C;D5C394|4525 C;CBB684|4515 C;BAA26A|4505 C;9F8444|4495 C;927633|4485 C;664F26|454 C;CFC6A8|453 C;C5BA99|452 C;B6A87F|451 C;A29260|450 C;5E4926|449 C;564528|448 C;4E412A|7499 C;F7E4B3|7500 C;E5D0A7|7501 C;DFC79E|7502 C;D4B788|7503 C;AF9869|7504 C;99785E|7505 C;866040|468 C;E3CAA5|467 C;DBBA8E|466 C;CEA877|465 C;C2955C|464 C;935A2A|463 C;7A4E29|462 C;61452C|7506 C;F6DAB3|7507 C;FFD29A|7508 C;E8B77F|7509 C;DDA361|7510 C;CD893F|7511 C;BF7729|7512 C;AD631B|719 C;F2C8A3|720 C;EDB78A|721 C;E4A46F|722 C;CF8342|723 C;B96A23|724 C;984D0F|725 C;824015|475 C;F8CFB3|474 C;F7C6A7|473 C;F7BF9B|472 C;ED9E6D|471 C;C06124|470 C;AA5B2A|469 C;6D3F23|726 C;E5C09F|727 C;DFB48F|728 C;D3A177|729 C;BB8150|730 C;A4662D|731 C;7C4212|732 C;663512|4685 C;E4C5AE|4675 C;E0BFA7|4665 C;D2A788|4655 C;C49474|4645 C;B27C58|4635 C;9A6037|4625 C;522C1D|7513 C;E5B8A7|7514 C;DAA286|7515 C;CB8B68|7516 C;9F552A|7517 C;8B431E|7518 C;704F47|7519 C;614B3D|4755 C;DBC3B8|4745 C;D2B4A8|4735 C;C5A292|4725 C;B3897A|4715 C;9B6B58|4705 C;824D3B|4695 C;5F3327|482 C;DFC7B7|481 C;D8BAA8|480 C;CDA892|479 C;B17F66|478 C;773D2B|477 C;673A2A|476 C;523629|7527 C;D8D2C4|7528 C;C7B9AC|7529 C;B9A99B|7530 C;A69383|7531 C;7D6855|7532 C;66503E|7533 C;493729|7534 C;D3CCBD|7535 C;B9B09C|7536 C;A99F88|7537 C;A8ACA2|7538 C;959A90|7539 C;8F8F89|7540 C;4A4F54|427 C;D0D3D5|428 C;C0C6C9|429 C;A2A9AE|430 C;7B868E|431 C;596770|432 C;313F48|433 C;1C252D|420 C;C8C8C7|421 C;B2B4B3|422 C;9FA1A2|423 C;898D8E|424 C;717273|425 C;54575A|426 C;24282A|441 C;BCC6C4|442 C;A0ACAC|443 C;8E9D9D|444 C;6E7D7E|445 C;4D5859|446 C;3D4544|447 C;363A36|413 C;BBBAB1|414 C;AAA99F|415 C;929389|416 C;7F7F74|417 C;66665C|418 C;52534A|419 C;212322|400 C;C6BEB6|401 C;B1A9A0|402 C;9F968D|403 C;8E847B|404 C;796E65|405 C;6B6158|406 C;C6BCB7|407 C;B3A7A2|408 C;998C88|409 C;877874|410 C;766662|411 C;60514D|412 C;392F2D|434 C;D0C4C5|435 C;C0B3B5|436 C;AA999D|437 C;796569|438 C;574546|439 C;453635|440 C;382E2C|Warm Gray 1 C;D9D2CB|Warm Gray 2 C;CCC4BD|Warm Gray 3 C;C1B7B0|Warm Gray 4 C;B8ADA5|Warm Gray 5 C;AEA39B|Warm Gray 6 C;A79C95|Warm Gray 7 C;988C84|Warm Gray 8 C;8E827A|Warm Gray 9 C;857870|Warm Gray 10 C;7B6E66|Warm Gray 11 C;70625A|Cool Gray 1 C;DAD9D7|Cool Gray 2 C;D0D0CE|Cool Gray 3 C;C9C9C8|Cool Gray 4 C;BBBCBC|Cool Gray 5 C;B1B2B3|Cool Gray 6 C;A7A8AA|Cool Gray 7 C;97999B|Cool Gray 8 C;898B8E|Cool Gray 9 C;75787B|Cool Gray 10 C;63666A|Cool Gray 11 C;53565A|Black 2 C;352E21|Black 3 C;212722|Black 4 C;32261D|Black 5 C;3F2B2E|Black 6 C;0E1820|Black 7 C;3D3935";

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

/*
 * Escolhe preto ou branco para escrever em cima de uma cor, pela razao de
 * contraste da WCAG 2.1. Devolve "black" ou "white".
 *
 * Nao e "escuro? entao branco": no meio da escala a conta muda de lado. Um
 * amarelo forte tem luminancia alta e pede preto; um azul medio, do mesmo
 * brilho aparente, pede branco.
 */
function relativeLuminance(rgb) {
    var lin = [];
    for (var i = 0; i < 3; i++) {
        var c = clamp(rgb[i], 0, 255) / 255;
        lin[i] = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function pickTextColor(rgb) {
    var L = relativeLuminance(rgb);
    var contrastWithWhite = 1.05 / (L + 0.05);
    var contrastWithBlack = (L + 0.05) / 0.05;
    return contrastWithBlack >= contrastWithWhite ? "black" : "white";
}

function contrastRatio(rgbA, rgbB) {
    var a = relativeLuminance(rgbA);
    var b = relativeLuminance(rgbB);
    var hi = a > b ? a : b;
    var lo = a > b ? b : a;
    return (hi + 0.05) / (lo + 0.05);
}

/* CIE Lab D65 -> sRGB 0-255, recortado no gamut. Inverso de rgbToLab. */
function labToRgb(lab) {
    var fy = (lab[0] + 16) / 116;
    var fx = fy + lab[1] / 500;
    var fz = fy - lab[2] / 200;

    var f = [fx, fy, fz];
    var xyz = [];
    for (var i = 0; i < 3; i++) {
        var cube = f[i] * f[i] * f[i];
        xyz[i] = cube > 0.008856451679 ? cube : (116 * f[i] - 16) / 903.2962962;
    }

    var x = xyz[0] * 0.95047;
    var y = xyz[1] * 1.00000;
    var z = xyz[2] * 1.08883;

    var lin = [
        x * 3.2404542 + y * -1.5371385 + z * -0.4985314,
        x * -0.9692660 + y * 1.8760108 + z * 0.0415560,
        x * 0.0556434 + y * -0.2040259 + z * 1.0572252
    ];

    var out = [];
    for (var j = 0; j < 3; j++) {
        var c = lin[j] <= 0.0031308
            ? 12.92 * lin[j]
            : 1.055 * Math.pow(lin[j] < 0 ? 0 : lin[j], 1 / 2.4) - 0.055;
        out[j] = clamp(c * 255, 0, 255);
    }
    return out;
}

/*
 * Cor de texto derivada da propria cor do bloco: mesma matiz, luminosidade
 * empurrada para o lado oposto ate atingir `minContrast`.
 *
 * Preto e branco puros resolvem contraste mas achatam o cartao — o rotulo fica
 * parecendo colado por cima. Manter a e b do Lab e mexer so no L da aquele
 * magenta escuro sobre rosa, oliva sobre amarelo, rosa claro sobre vinho. Se
 * nenhum L atingir o contraste pedido (acontece em cores ja muito escuras ou
 * muito claras), cai para preto ou branco, que sempre atinge.
 */
function deriveInkColor(rgb, minContrast) {
    var lab = rgbToLab(rgb);
    var goingDark = lab[0] > 50;
    var step = goingDark ? -2 : 2;

    var L = lab[0];
    for (var i = 0; i < 60; i++) {
        L += step;
        if (L < 0 || L > 100) break;
        var candidate = labToRgb([L, lab[1], lab[2]]);
        if (contrastRatio(rgb, candidate) >= minContrast) return candidate;
    }
    return goingDark ? [0, 0, 0] : [255, 255, 255];
}

/*
 * Larguras dos blocos de uma linha do bento, em colunas.
 *
 * A soma bate exatamente com `columns` por construcao, entao nao ha como
 * sobrar buraco nem estourar a linha. O deslocamento por `rowIndex` faz o bloco
 * largo andar de lugar a cada linha, que e o que da o desenho de mosaico em vez
 * de listras.
 */
function bentoRowSpans(columns, rowIndex) {
    if (columns < 1) columns = 1;
    if (columns === 1) return [1];

    var spans = [];
    var remaining = columns;
    var i = 0;
    while (remaining > 0) {
        var span = ((rowIndex + i) % 3 === 0) ? 2 : 1;
        if (span > remaining) span = remaining;
        spans.push(span);
        remaining -= span;
        i++;
    }
    return spans;
}

/* Linhas altas e normais se alternam para o mosaico nao virar uma grade. */
function bentoRowIsTall(rowIndex) {
    return rowIndex % 3 === 1;
}

function formatNumbers(values, separator) {
    var out = [];
    for (var i = 0; i < values.length; i++) out[i] = Math.round(values[i]);
    return out.join(separator == null ? ", " : separator);
}

/*
 * Estrutura do cartao, separada do desenho para poder ser testada:
 *
 *   {
 *     title: "ROSA",                 canto superior esquerdo
 *     badge: "PANTONE 231 C",        canto superior direito
 *     rows: [                        bloco inferior, rotulo | valor
 *       { label: "HEX",  value: "#FF99FF" },
 *       { label: "RGB",  value: "255, 153, 255" },
 *       { label: "CMYK", value: "0, 40, 0, 0" }
 *     ]
 *   }
 *
 * O Pantone mais proximo vai para o cabecalho; os demais, quando pantoneCount
 * for maior que 1, viram linhas do bloco. Toda linha de Pantone continua sendo
 * resultado de busca por proximidade, nunca leitura da cor — o dE ao lado
 * (showDeltaE) e o que diz o quanto ela esta longe.
 */
function buildCard(rec, cfg) {
    var title = rec.name || "";
    if (title && cfg.uppercaseName) title = title.toUpperCase();

    var badge = "";
    var rows = [];

    /*
     * O dE so entra quando acrescenta informacao. Com showDeltaE "auto" ele
     * aparece apenas nos matches fracos: o cartao fica limpo como num guia de
     * marca, e o aviso sobra para as cores em que a aproximacao de fato
     * merece conferencia num leque fisico.
     */
    function pantoneText(hit) {
        var show = cfg.showDeltaE === true ||
            (cfg.showDeltaE === "auto" && hit.deltaE > cfg.deltaEThreshold);
        return show
            ? hit.name + "  dE " + (Math.round(hit.deltaE * 10) / 10)
            : hit.name;
    }

    if (cfg.showPantone && rec.pantone && rec.pantone.length) {
        badge = pantoneText(rec.pantone[0]);
    }

    if (cfg.showHex) rows.push({ label: "HEX", value: rec.hex });
    if (cfg.showRGB) rows.push({ label: "RGB", value: formatNumbers(rec.rgb) });
    if (cfg.showCMYK) rows.push({ label: "CMYK", value: formatNumbers(rec.cmyk) });

    if (cfg.showPantone && rec.pantone) {
        for (var i = 1; i < rec.pantone.length; i++) {
            rows.push({ label: "PANTONE", value: pantoneText(rec.pantone[i]) });
        }
    }

    return { title: title, badge: badge, rows: rows };
}

/*
 * Largura de texto que o cartao precisa, em caracteres.
 *
 * Cada linha e um par rotulo/valor em colunas opostas, entao o que importa e a
 * soma dos dois mais uma folga entre eles — nao a linha mais longa. O mesmo
 * vale para titulo e badge no cabecalho.
 */
function cardTextChars(card, gapChars) {
    // Folga generosa: no cabecalho o nome e o Pantone ficam em cantos opostos e
    // encostar um no outro e o que mais estraga o cartao.
    if (gapChars == null) gapChars = 6;

    var widest = 0;
    if (card.title || card.badge) {
        widest = card.title.length + card.badge.length + gapChars;
    }
    for (var i = 0; i < card.rows.length; i++) {
        var n = card.rows[i].label.length + card.rows[i].value.length + gapChars;
        if (n > widest) widest = n;
    }
    return widest;
}

/*
 * Le uma lista de cores colada pelo usuario.
 *
 * Um codigo por linha. Aceita:
 *   #FF99FF   FF99FF   #F9F        hexadecimal
 *   255, 153, 255                  tres numeros = RGB
 *   0, 40, 0, 0                    quatro numeros = CMYK
 *   rgb(255, 153, 255)             a pontuacao e ignorada
 *   Rosa: #FF99FF                  nome antes do codigo
 *
 * Linha SEM codigo vira titulo de grupo, e as cores seguintes entram nele:
 *
 *   Principais          <- grupo
 *   Rosa: #FF99FF
 *   Amarelo: #F8F852
 *   Secundarias         <- grupo
 *   Bege: #FFD9DA
 *
 * Devolve { groups: [{name, colors: [{name, rgb} | {name, cmyk}]}], errors: [] }.
 */
function trimText(s) {
    return String(s).replace(/^[\s ]+/, "").replace(/[\s ]+$/, "");
}

function parseColorLine(line) {
    // Hexadecimal com # e o caso sem ambiguidade: tenta primeiro.
    var hexMatch = line.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    if (hexMatch) {
        return { name: trimSeparators(line.substring(0, line.indexOf(hexMatch[0]))),
                 rgb: hexToRgb(hexMatch[1]) };
    }

    // Tres numeros = RGB, quatro = CMYK. Qualquer outra quantidade nao e cor:
    // "Cores 2024" e "Grid 3 x 3" tem de continuar sendo titulo de grupo.
    var numbers = line.match(/\d+(\.\d+)?/g);
    if (numbers && (numbers.length === 3 || numbers.length === 4)) {
        var values = [];
        for (var i = 0; i < numbers.length; i++) values[i] = parseFloat(numbers[i]);
        var name = trimSeparators(line.substring(0, line.indexOf(numbers[0])));

        if (values.length === 3) {
            for (var r = 0; r < 3; r++) {
                if (values[r] < 0 || values[r] > 255) {
                    return { error: "RGB fora de 0-255" };
                }
            }
            return { name: name, rgb: values };
        }
        for (var c = 0; c < 4; c++) {
            if (values[c] < 0 || values[c] > 100) {
                return { error: "CMYK fora de 0-100" };
            }
        }
        return { name: name, cmyk: values };
    }

    // Hexadecimal sem #: so quando for o token isolado no fim da linha, para
    // nao confundir uma palavra que por acaso so tenha letras de A a F.
    var bare = line.match(/(^|\s)([0-9a-fA-F]{6})\s*$/);
    if (bare) {
        return { name: trimSeparators(line.substring(0, line.lastIndexOf(bare[2]))),
                 rgb: hexToRgb(bare[2]) };
    }

    return null;
}

function trimSeparators(s) {
    return trimText(String(s).replace(/[:\-–—|=,]+\s*$/, ""));
}

function hexToRgb(hex) {
    if (hex.length === 3) {
        hex = hex.charAt(0) + hex.charAt(0) +
              hex.charAt(1) + hex.charAt(1) +
              hex.charAt(2) + hex.charAt(2);
    }
    return [
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16)
    ];
}

function parseColorInput(text) {
    var lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var groups = [];
    var errors = [];
    var current = null;

    for (var i = 0; i < lines.length; i++) {
        var line = trimText(lines[i]).replace(/^[-*•]\s+/, "");
        if (!line) continue;

        var parsed = parseColorLine(line);

        if (!parsed) {
            // Titulo de grupo. Tira enfeites tipo "## Principais ##" e "-- x --".
            var name = trimText(line.replace(/^[#=\-–—\s]+/, "").replace(/[#=\-–—:\s]+$/, ""));
            current = { name: name, colors: [] };
            groups.push(current);
            continue;
        }

        if (parsed.error) {
            errors.push("linha " + (i + 1) + ": " + parsed.error + " (" + line + ")");
            continue;
        }

        if (!current) {
            current = { name: "", colors: [] };
            groups.push(current);
        }
        current.colors.push(parsed);
    }

    // Grupo declarado e nunca preenchido nao deve virar titulo solto.
    var kept = [];
    for (var g = 0; g < groups.length; g++) {
        if (groups[g].colors.length) kept.push(groups[g]);
    }

    return { groups: kept, errors: errors };
}

/* Versao em texto corrido, usada pelo layout em grade. */
function cardToLines(card) {
    var lines = [];
    if (card.title) lines.push(card.title);
    if (card.badge) lines.push(card.badge);
    for (var i = 0; i < card.rows.length; i++) {
        lines.push(card.rows[i].label + " " + card.rows[i].value);
    }
    return lines;
}

function buildLabel(rec, cfg) {
    var card = buildCard(rec, cfg);
    if (!cfg.showName) card.title = "";
    return cardToLines(card).join("\r");
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

/*
 * Caixa para colar a lista de cores. Devolve o texto, ou null se cancelado.
 *
 * Fica de fora dos testes: ScriptUI so existe dentro do Illustrator. Toda a
 * logica esta em parseColorInput, que e pura e testada.
 */
function promptForColors() {
    var dialog = new Window("dialog", "Legenda de cores");
    dialog.orientation = "column";
    dialog.alignChildren = "fill";
    dialog.spacing = 10;
    dialog.margins = 16;

    var help = dialog.add("statictext", undefined,
        "Cole os codigos, um por linha:\n" +
        "\n" +
        "   Principais\n" +
        "   Rosa: 255, 153, 255\n" +
        "   Amarelo: #F8F852\n" +
        "   Secundarias\n" +
        "   Bege: 255, 217, 218\n" +
        "\n" +
        "Aceita HEX, tres numeros (RGB) ou quatro (CMYK). Linha sem codigo\n" +
        "vira titulo de grupo. O nome antes do codigo e opcional.",
        { multiline: true });
    help.characters = 62;

    var input = dialog.add("edittext", undefined, "", { multiline: true, scrolling: true });
    input.preferredSize = [440, 260];
    input.active = true;

    var buttons = dialog.add("group");
    buttons.alignment = "right";
    buttons.add("button", undefined, "Cancelar", { name: "cancel" });
    buttons.add("button", undefined, "Gerar", { name: "ok" });

    return dialog.show() === 1 ? input.text : null;
}

function collectFromInput(text, sink) {
    var parsed = parseColorInput(text);

    for (var g = 0; g < parsed.groups.length; g++) {
        var group = parsed.groups[g];
        for (var c = 0; c < group.colors.length; c++) {
            var color = group.colors[c];
            sink.push({
                color: null,
                name: color.name || null,
                group: group.name,
                rgb: color.rgb || null,
                cmyk: color.cmyk || null
            });
        }
    }
    return parsed.errors;
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
        var norm;

        if (raw[i].rgb || raw[i].cmyk) {
            // Veio da lista colada: ja e um par de valores, nao um objeto de
            // cor do Illustrator. A conversao entre os dois espacos usa o
            // perfil do documento, igual ao resto.
            var inRgb = raw[i].rgb;
            var inCmyk = raw[i].cmyk;
            if (!inRgb) {
                inRgb = convert(ImageColorSpace.CMYK, inCmyk, ImageColorSpace.RGB)
                    || cmykToRgbNaive(inCmyk);
            }
            if (!inCmyk) {
                inCmyk = convert(ImageColorSpace.RGB, inRgb, ImageColorSpace.CMYK)
                    || rgbToCmykNaive(inRgb);
            }
            norm = { rgb: inRgb, cmyk: inCmyk, spotName: null };
        } else {
            norm = normalizeColor(raw[i].color);
        }

        if (!norm) {
            skipped++;
            continue;
        }

        var hex = toHex(norm.rgb);
        var name = norm.spotName || raw[i].name || null;
        var group = raw[i].group || "";
        var key = group + "/" + hex + "/" + (name || "");
        if (seen[key]) continue;
        seen[key] = true;

        records.push({
            group: group,
            name: name,
            hex: hex,
            rgb: norm.rgb,
            cmyk: norm.cmyk,
            pantone: CONFIG.showPantone ? nearestPantone(norm.rgb, CONFIG.pantoneCount) : null
        });
    }

    return { records: records, skipped: skipped };
}

function makeFlatColor(doc, rgb, cmyk) {
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
        var c = new CMYKColor();
        c.cyan = cmyk[0]; c.magenta = cmyk[1]; c.yellow = cmyk[2]; c.black = cmyk[3];
        return c;
    }
    var r = new RGBColor();
    r.red = rgb[0]; r.green = rgb[1]; r.blue = rgb[2];
    return r;
}

function makeBlack(doc) {
    return makeFlatColor(doc, [0, 0, 0], [0, 0, 0, 100]);
}

function makeWhite(doc) {
    return makeFlatColor(doc, [255, 255, 255], [0, 0, 0, 0]);
}

function countLines(text) {
    var n = 1;
    for (var i = 0; i < text.length; i++) if (text.charAt(i) === "\r") n++;
    return n;
}

function longestLineLength(text) {
    var longest = 0;
    var current = 0;
    for (var i = 0; i < text.length; i++) {
        if (text.charAt(i) === "\r") {
            if (current > longest) longest = current;
            current = 0;
        } else {
            current++;
        }
    }
    return current > longest ? current : longest;
}

/*
 * Corpo de texto que faz o rotulo caber em `maxWidth`.
 *
 * A largura e estimada por contagem de caracteres, nao medida: ler
 * TextFrame.width obrigaria a criar o texto, medir e reposicionar, e a
 * ancoragem de pointText muda de semantica no meio disso. O fator 0.55 em e
 * uma media larga para as sem-serifa usadas em legenda — erra para o lado de
 * encolher demais, que e o lado seguro.
 *
 * "PANTONE Neutral Black C  dE 2.5" tem 31 caracteres: a 9 pt pede ~153 pt de
 * largura e nao cabe num bloco de 110. Sem isto o texto vaza por cima do bloco
 * vizinho.
 *
 * Recebe a contagem de caracteres, nao o texto: no cartao o que ocupa a linha e
 * a soma do rotulo com o valor em colunas opostas, nao a maior string.
 */
/*
 * Largura de coluna que faz o rotulo mais longo do conjunto caber no corpo
 * base, dentro de [minWidth, maxWidth].
 *
 * Encolher a fonte por bloco resolve o transbordo mas entrega uma legenda
 * desigual: os blocos de 2 colunas ficam com 9 pt e os de 1 coluna com 6 pt,
 * lado a lado. Alargar a coluna mantem um corpo unico para tudo. A conta e
 * feita para UMA coluna, entao os blocos largos sobram espaco — e o lado certo
 * de errar.
 */
function autoUnitWidth(charCounts, baseSize, pad, minWidth, maxWidth) {
    var longest = 0;
    for (var i = 0; i < charCounts.length; i++) {
        if (charCounts[i] > longest) longest = charCounts[i];
    }
    if (longest === 0) return minWidth;

    var needed = longest * baseSize * 0.55 + pad * 2;
    if (needed < minWidth) return minWidth;
    if (needed > maxWidth) return maxWidth;
    return Math.ceil(needed);
}

function fitTextSize(chars, maxWidth, baseSize, minSize) {
    if (chars <= 0 || maxWidth <= 0) return baseSize;

    var fitted = maxWidth / (chars * 0.55);
    if (fitted >= baseSize) return baseSize;
    if (fitted < minSize) return minSize;
    return Math.floor(fitted * 10) / 10;
}

/*
 * Calcula onde cada cartao vai, sem desenhar nada.
 *
 * Coordenadas com origem em (0,0) no canto superior esquerdo e y crescendo para
 * BAIXO — a conversao para o sistema do Illustrator, que cresce para cima,
 * acontece so na hora de desenhar. Isso mantem a funcao pura e testavel, e e
 * necessario tambem para saber o tamanho total antes de desenhar o painel de
 * fundo, que precisa ficar atras de tudo.
 *
 * `cards` sao as estruturas de buildCard; `unitW` a largura de uma coluna.
 */
function planBento(sections, unitW, cfg) {
    var pad = cfg.bentoPadding;
    var tiles = [];
    var headings = [];
    var y = 0;
    var rowIndex = 0;
    var maxRight = 0;

    for (var g = 0; g < sections.length; g++) {
        var section = sections[g];
        if (!section.cards.length) continue;

        if (g > 0) y += cfg.groupGapY;

        if (section.name) {
            // y aqui e o TOPO da caixa do titulo; o desenho converte para a
            // linha de base.
            headings.push({ text: section.name, x: 0, y: y, size: cfg.groupHeadingSize });
            y += cfg.groupHeadingSize * 1.3 + cfg.groupHeadingGap;
        }

        var index = 0;
        while (index < section.cards.length) {
            var spans = cfg.bentoMosaic ? bentoRowSpans(cfg.columns, rowIndex) : null;

            // Mede a linha inteira antes de posicionar: os cartoes precisam da
            // mesma altura, que e a do conteudo mais alto entre eles.
            var rowTiles = [];
            var needed = 0;
            for (var s = 0; s < cfg.columns && index + s < section.cards.length; s++) {
                var span = spans ? spans[s] : 1;
                if (span == null) break;

                var w = unitW * span + cfg.gapX * (span - 1);
                var entry = section.cards[index + s];
                var size = fitTextSize(cardTextChars(entry.card), w - pad * 2,
                                       cfg.textSize, cfg.minTextSize);
                var lead = size * cfg.bentoLineSpacing;

                // cabecalho + linhas de valor, tudo entre os paddings
                var headerH = (entry.card.title || entry.card.badge) ? lead : 0;
                var contentH = headerH + entry.card.rows.length * lead + pad * 2;

                rowTiles.push({ index: entry.index, w: w, size: size });
                if (contentH > needed) needed = contentH;

                if (spans && s + 1 >= spans.length) break;
            }
            if (!rowTiles.length) break;

            // Se a coluna teve de alargar, a altura acompanha para o cartao
            // manter a proporcao; senao ele viraria uma faixa achatada.
            var baseH = cfg.swatchH * (unitW / cfg.swatchW);
            var nominal = baseH *
                ((cfg.bentoMosaic && bentoRowIsTall(rowIndex)) ? cfg.bentoTallFactor : 1);
            var rowH = nominal > needed ? nominal : needed;

            var x = 0;
            for (var t = 0; t < rowTiles.length; t++) {
                rowTiles[t].x = x;
                rowTiles[t].y = y;
                rowTiles[t].h = rowH;
                tiles.push(rowTiles[t]);
                x += rowTiles[t].w + cfg.gapX;
            }
            if (x - cfg.gapX > maxRight) maxRight = x - cfg.gapX;

            index += rowTiles.length;
            y += rowH + cfg.gapY;
            rowIndex++;
        }
    }

    return {
        tiles: tiles,
        headings: headings,
        width: maxRight,
        height: y > 0 ? y - cfg.gapY : 0
    };
}

/*
 * Junta os registros em secoes na ordem em que os grupos aparecem. Registro sem
 * grupo cai numa secao unica sem titulo, que e o caso de quem le do documento.
 */
function groupRecords(records, cards) {
    var sections = [];
    var byName = {};

    for (var i = 0; i < records.length; i++) {
        var name = records[i].group || "";
        var key = "g:" + name;
        if (!byName[key]) {
            byName[key] = { name: name, cards: [] };
            sections.push(byName[key]);
        }
        byName[key].cards.push({ index: i, card: cards[i] });
    }
    return sections;
}

/*
 * Largura de coluna do bento.
 *
 * A grade regular e o que faz a prancheta ler como sistema, entao a largura
 * configurada manda: um nome comprido encolhe o texto, nao deforma a coluna.
 * O cartao so alarga quando nem o corpo minimo caberia — ai a alternativa
 * seria texto ilegivel, que e pior.
 *
 * E a prioridade inversa da que valia antes, quando um unico nome longo
 * inflava a legenda inteira.
 */
function bentoUnitWidth(charCounts, cfg) {
    if (!cfg.autoWidth) return cfg.swatchW;

    var longest = 0;
    for (var i = 0; i < charCounts.length; i++) {
        if (charCounts[i] > longest) longest = charCounts[i];
    }
    if (longest === 0) return cfg.swatchW;

    // Cabe no cartao configurado, mesmo que com texto menor? Entao fica.
    var atConfigured = fitTextSize(longest, cfg.swatchW - cfg.bentoPadding * 2,
                                   cfg.textSize, 0);
    if (atConfigured >= cfg.minTextSize) return cfg.swatchW;

    // Nao cabe nem no corpo minimo: alarga ate caber, dentro do teto.
    return autoUnitWidth([longest], cfg.minTextSize, cfg.bentoPadding,
                         cfg.swatchW, cfg.maxSwatchW);
}

/* Contexto de desenho compartilhado pelos dois layouts. */
function makeCanvas(doc) {
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
    var font = null;
    if (CONFIG.fontName) {
        try { font = app.textFonts.getByName(CONFIG.fontName); } catch (e) {}
    }

    var group = layer.groupItems.add();
    group.name = "Color Codes";

    return {
        doc: doc,
        group: group,
        originX: board[0] + 20,
        originY: board[1] - 20,
        black: makeBlack(doc),
        white: makeWhite(doc),
        font: font,
        lineHeight: CONFIG.textSize * 1.3
    };
}

/*
 * Retangulo com cantos arredondados, caindo para o reto se a versao do
 * Illustrator nao tiver roundedRectangle ou se o raio for zero.
 */
function addRect(container, top, left, w, h, radius) {
    if (radius > 0) {
        try {
            return container.pathItems.roundedRectangle(top, left, w, h, radius, radius, false);
        } catch (e) {}
    }
    return container.pathItems.rectangle(top, left, w, h);
}

function drawTile(canvas, rec, x, y, w, h) {
    var card = canvas.group.groupItems.add();
    card.name = rec.name || rec.hex;

    var rect = addRect(card, y, x, w, h, CONFIG.cornerRadius);
    rect.filled = true;
    rect.stroked = false;
    // Pinta com a cor reconstruida, para bater com os valores exibidos.
    rect.fillColor = makeFlatColor(canvas.doc, rec.rgb, rec.cmyk);

    return card;
}

/*
 * `align` e "left" ou "right". Em pointText a justificacao a direita ancora o
 * texto NO ponto, entao passar a borda direita do cartao ja alinha a coluna de
 * valores sem precisar medir string nenhuma.
 */
function drawText(canvas, card, label, x, baselineY, color, size, align, spacing) {
    var text = card.textFrames.pointText([x, baselineY]);
    text.contents = label;
    try {
        text.textRange.characterAttributes.size = size;
        text.textRange.characterAttributes.leading = size * (spacing || 1.3);
        text.textRange.characterAttributes.fillColor = color;
        if (canvas.font) text.textRange.characterAttributes.textFont = canvas.font;
    } catch (e) {}
    if (align === "right") {
        try {
            text.paragraphs[0].paragraphAttributes.justification = Justification.RIGHT;
        } catch (e) {}
    }
    return text;
}

function drawBackdrop(canvas, left, top, w, h, rgb, radius) {
    if (!rgb) return null;
    var rect = addRect(canvas.group, top, left, w, h, radius);
    rect.filled = true;
    rect.stroked = false;
    rect.fillColor = makeFlatColor(canvas.doc, rgb, rgbToCmykNaive(rgb));
    return rect;
}

/*
 * Grade uniforme: amostra em cima, rotulo em preto embaixo.
 *
 * A altura de linha e uma so, calculada pelo rotulo mais alto do conjunto. Ela
 * precisa ser uniforme porque a posicao de cada item e o indice da linha vezes
 * a altura — usar a altura do proprio item desalinharia tudo assim que dois
 * rotulos tivessem numeros de linhas diferentes.
 */
function drawGrid(canvas, records) {
    var labels = [];
    var chars = [];
    for (var m = 0; m < records.length; m++) {
        labels[m] = buildLabel(records[m], CONFIG);
        chars[m] = longestLineLength(labels[m]);
    }

    // No grid o rotulo fica fora da amostra, entao pode usar tambem o respiro
    // ate a coluna seguinte.
    var unitW = CONFIG.autoWidth
        ? autoUnitWidth(chars, CONFIG.textSize, 0, CONFIG.swatchW, CONFIG.maxSwatchW) - CONFIG.gapX
        : CONFIG.swatchW;
    if (unitW < CONFIG.swatchW) unitW = CONFIG.swatchW;
    var textWidth = unitW + CONFIG.gapX;

    var sizes = [];
    var tallest = 0;
    for (var n = 0; n < records.length; n++) {
        sizes[n] = fitTextSize(chars[n], textWidth, CONFIG.textSize, CONFIG.minTextSize);
        var h = countLines(labels[n]) * sizes[n] * CONFIG.gridLineSpacing;
        if (h > tallest) tallest = h;
    }
    var rowH = CONFIG.swatchH + tallest + CONFIG.gapY;

    // Os grupos vindos da lista colada valem aqui tambem: cada um comeca numa
    // linha nova, com o titulo acima.
    var cardsForGrouping = [];
    for (var k = 0; k < records.length; k++) cardsForGrouping[k] = null;
    var sections = groupRecords(records, cardsForGrouping);

    var y = canvas.originY;
    for (var g = 0; g < sections.length; g++) {
        if (g > 0) y -= CONFIG.groupGapY;

        if (sections[g].name) {
            var heading = CONFIG.uppercaseGroup
                ? sections[g].name.toUpperCase()
                : sections[g].name;
            drawText(canvas, canvas.group, heading, canvas.originX,
                     y - CONFIG.groupHeadingSize, canvas.black,
                     CONFIG.groupHeadingSize, "left");
            y -= CONFIG.groupHeadingSize * 1.3 + CONFIG.groupHeadingGap;
        }

        for (var c = 0; c < sections[g].cards.length; c++) {
            var idx = sections[g].cards[c].index;
            var x = canvas.originX + (c % CONFIG.columns) * (unitW + CONFIG.gapX);
            var cardY = y - Math.floor(c / CONFIG.columns) * rowH;

            var card = drawTile(canvas, records[idx], x, cardY, unitW, CONFIG.swatchH);
            drawText(canvas, card, labels[idx], x,
                     cardY - CONFIG.swatchH - sizes[idx] - 4,
                     canvas.black, sizes[idx], "left", CONFIG.gridLineSpacing);
        }
        y -= Math.ceil(sections[g].cards.length / CONFIG.columns) * rowH;
    }
}

/*
 * Bento: cartoes de cantos arredondados sobre um painel.
 *
 * Cada cartao traz o nome no canto superior esquerdo, o Pantone no superior
 * direito, e os valores no rodape em duas colunas — rotulo a esquerda, valor
 * alinhado a direita. O texto usa uma cor derivada da propria cor do cartao
 * (mesma matiz, luminosidade oposta), nao preto ou branco chapado.
 */
function drawBento(canvas, records) {
    var pad = CONFIG.bentoPadding;

    var cards = [];
    var chars = [];
    for (var m = 0; m < records.length; m++) {
        cards[m] = buildCard(records[m], CONFIG);
        if (!CONFIG.showName) cards[m].title = "";
        chars[m] = cardTextChars(cards[m]);
    }

    var unitW = bentoUnitWidth(chars, CONFIG);

    var plan = planBento(groupRecords(records, cards), unitW, CONFIG);

    // O fundo e o painel entram primeiro: no Illustrator o que e criado depois
    // fica por cima, entao desenhar os cartoes em seguida os deixa na frente.
    var panelPad = CONFIG.panelColor ? CONFIG.panelPadding : 0;
    var bgPad = panelPad + (CONFIG.backgroundColor ? CONFIG.backgroundPadding : 0);

    drawBackdrop(canvas,
        canvas.originX - bgPad, canvas.originY + bgPad,
        plan.width + bgPad * 2, plan.height + bgPad * 2,
        CONFIG.backgroundColor, CONFIG.panelRadius + CONFIG.backgroundPadding);

    drawBackdrop(canvas,
        canvas.originX - panelPad, canvas.originY + panelPad,
        plan.width + panelPad * 2, plan.height + panelPad * 2,
        CONFIG.panelColor, CONFIG.panelRadius);

    for (var hd = 0; hd < plan.headings.length; hd++) {
        var head = plan.headings[hd];
        var text = CONFIG.uppercaseGroup ? head.text.toUpperCase() : head.text;
        drawText(canvas, canvas.group, text,
                 canvas.originX + head.x, canvas.originY - head.y - head.size,
                 canvas.black, head.size, "left");
    }

    for (var t = 0; t < plan.tiles.length; t++) {
        var tile = plan.tiles[t];
        var rec = records[tile.index];
        var card = cards[tile.index];

        // y do plano cresce para baixo; o do Illustrator, para cima.
        var x = canvas.originX + tile.x;
        var y = canvas.originY - tile.y;

        var group = drawTile(canvas, rec, x, y, tile.w, tile.h);

        var inkRgb = deriveInkColor(rec.rgb, CONFIG.minInkContrast);
        var ink = makeFlatColor(canvas.doc, inkRgb, rgbToCmykNaive(inkRgb));

        var lead = tile.size * CONFIG.bentoLineSpacing;
        var leftX = x + pad;
        var rightX = x + tile.w - pad;

        if (card.title || card.badge) {
            var headBaseline = y - pad - tile.size;
            if (card.title) {
                drawText(canvas, group, card.title, leftX, headBaseline, ink, tile.size, "left");
            }
            if (card.badge) {
                drawText(canvas, group, card.badge, rightX, headBaseline, ink, tile.size, "right");
            }
        }

        if (card.rows.length) {
            // pointText ancora na base da PRIMEIRA linha e as seguintes descem;
            // para encostar o bloco no rodape, sobe (n-1) entrelinhas.
            var bodyBaseline = (y - tile.h) + pad + (card.rows.length - 1) * lead;
            var labels = [];
            var values = [];
            for (var r = 0; r < card.rows.length; r++) {
                labels.push(card.rows[r].label);
                values.push(card.rows[r].value);
            }
            drawText(canvas, group, labels.join("\r"), leftX, bodyBaseline,
                     ink, tile.size, "left", CONFIG.bentoLineSpacing);
            drawText(canvas, group, values.join("\r"), rightX, bodyBaseline,
                     ink, tile.size, "right", CONFIG.bentoLineSpacing);
        }
    }
}

function draw(doc, records) {
    var canvas = makeCanvas(doc);
    if (CONFIG.layout === "bento") {
        drawBento(canvas, records);
    } else {
        drawGrid(canvas, records);
    }
    return canvas.group;
}

function main() {
    if (app.documents.length === 0) {
        alert("Abra um documento primeiro.");
        return;
    }

    var doc = app.activeDocument;
    var raw = [];
    var inputErrors = [];
    var mode = CONFIG.source;

    if (mode === "auto") {
        mode = (doc.selection && doc.selection.length > 0) ? "selection" : "swatches";
    }

    if (mode === "input") {
        var text = promptForColors();
        if (text === null) return; // cancelado
        inputErrors = collectFromInput(text, raw);
        if (raw.length === 0) {
            var why = "Nenhum codigo de cor reconhecido no que foi colado.";
            if (inputErrors.length) why += "\n\n" + inputErrors.join("\n");
            alert(why);
            return;
        }
    } else if (mode === "selection") {
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
    if (inputErrors.length) {
        msg += "\n\n" + inputErrors.length + " linha(s) nao entendida(s):\n" + inputErrors.join("\n");
    }
    alert(msg);
}

// So executa dentro do Illustrator; em Node o arquivo pode ser carregado
// para testar as funcoes de cor.
if (typeof app !== "undefined" && app.documents) {
    main();
}
