/**
 * Encontro com Deus — API da planilha (Google Apps Script)  v2
 *
 * É a "ponte" entre o app (GitHub Pages) e esta planilha do Google Drive.
 *
 * INSTALAÇÃO (uma vez só, ~3 minutos):
 *  1. Abra a planilha no Google Planilhas → menu Extensões → Apps Script.
 *  2. Apague o conteúdo do editor, cole TODO este arquivo e salve (Ctrl+S).
 *  3. Implantar → Nova implantação → engrenagem → "App da Web"
 *        Executar como: Eu    |    Quem pode acessar: Qualquer pessoa
 *     Clique em Implantar e autorize com a sua conta.
 *  4. Volte à planilha e recarregue a página. Aparece o menu "Encontro com Deus".
 *     Clique em "Conectar celulares" → cole a URL do App da Web (termina em /exec) se pedir
 *     → copie o LINK DE CONEXÃO e abra-o em cada celular/computador da recepção.
 *
 * A chave de acesso é gerada automaticamente. Para cortar o acesso de todos os aparelhos:
 * menu "Encontro com Deus" → "Trocar chave de acesso".
 * Ao mudar este código: Implantar → Gerenciar implantações → lápis → Versão: Nova versão.
 */

var SITE_URL = 'https://svictorazevedo.github.io/encontro-com-deus/';

/* ============ menu na planilha ============ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Encontro com Deus')
    .addItem('Conectar celulares (link de conexão)', 'mostrarConexao')
    .addItem('Abrir o app', 'abrirApp')
    .addSeparator()
    .addItem('Trocar chave de acesso', 'trocarChave')
    .addToUi();
}

function chave_() {
  var props = PropertiesService.getScriptProperties();
  var c = props.getProperty('CHAVE');
  if (!c) {
    c = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    props.setProperty('CHAVE', c);
  }
  return c;
}

function urlApp_() {
  var props = PropertiesService.getScriptProperties();
  var salva = props.getProperty('URL_APP');
  if (salva) return salva;
  var u = '';
  try { u = ScriptApp.getService().getUrl() || ''; } catch (e) { u = ''; }
  return /\/exec$/.test(u) ? u : '';
}

function linkConexao_(url) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dados = JSON.stringify({ u: url, k: chave_(), n: ss ? ss.getName() : '' });
  var b64 = Utilities.base64EncodeWebSafe(dados, Utilities.Charset.UTF_8).replace(/=+$/, '');
  return SITE_URL + '#conectar=' + b64;
}

function mostrarConexao() {
  var url = urlApp_();
  var ui = SpreadsheetApp.getUi();
  if (!url) {
    var r = ui.prompt('Conectar celulares',
      'Cole a URL do App da Web (Implantar → Gerenciar implantações → copie a URL que termina em /exec):',
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    url = String(r.getResponseText() || '').trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
      ui.alert('Essa URL não parece a de um App da Web (deve começar com https://script.google.com/ e terminar em /exec).');
      return;
    }
    PropertiesService.getScriptProperties().setProperty('URL_APP', url);
  }
  var link = linkConexao_(url);
  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:system-ui,sans-serif;font-size:14px;color:#1d1b29}' +
    'textarea{width:100%;height:110px;font-size:12px;border:1px solid #ccc;border-radius:8px;padding:8px}' +
    'button,a.b{background:#5b3fd1;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;margin:6px 6px 0 0}' +
    '.s{background:#eee;color:#222}.m{color:#666;font-size:12px}</style>' +
    '<p>Abra este link em cada celular ou computador da recepção. O aparelho fica conectado a esta planilha.</p>' +
    '<textarea id="l" readonly>' + link + '</textarea>' +
    '<div><button onclick="var t=document.getElementById(\'l\');t.select();document.execCommand(\'copy\');this.textContent=\'Copiado!\'">Copiar link</button>' +
    '<a class="b s" target="_blank" href="https://wa.me/?text=' + encodeURIComponent('Acesso à recepção do Encontro com Deus: ' + link) + '">Enviar por WhatsApp</a>' +
    '<a class="b s" target="_blank" href="' + link + '">Abrir aqui</a></div>' +
    '<p class="m">⚠ Quem tiver este link vê os dados dos inscritos. Envie só para a equipe da recepção. ' +
    'Para cortar o acesso de todos: menu Encontro com Deus → Trocar chave de acesso.</p>'
  ).setWidth(520).setHeight(330);
  ui.showModalDialog(html, 'Link de conexão');
}

function abrirApp() {
  var html = HtmlService.createHtmlOutput('<script>window.open(' + JSON.stringify(SITE_URL) + ');google.script.host.close();</script>')
    .setWidth(10).setHeight(10);
  SpreadsheetApp.getUi().showModalDialog(html, 'Abrindo…');
}

function trocarChave() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Trocar chave de acesso',
    'Todos os aparelhos conectados perdem o acesso e precisarão do novo link. Continuar?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteProperty('CHAVE');
  chave_();
  mostrarConexao();
}

/* ============ API usada pelo app ============ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.acao) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">API do Encontro com Deus funcionando. ' +
      'Use o app: <a href="' + SITE_URL + '">' + SITE_URL + '</a></p>');
  }
  return responder_(p);
}

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { /* corpo inválido */ }
  return responder_(p);
}

function responder_(p) {
  var saida;
  try {
    saida = executar_(p);
    saida.ok = true;
  } catch (err) {
    saida = { ok: false, erro: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(saida)).setMimeType(ContentService.MimeType.JSON);
}

function abrirPlanilha_(ref) {
  var id = String(ref || '').trim();
  var m = id.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m) id = m[1];
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (err) { throw new Error('Não consegui abrir a planilha informada. Confira o link e o acesso da conta do script.'); }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script não está ligado a uma planilha. Instale pelo menu Extensões → Apps Script da planilha, ou informe o link da planilha no app.');
  return ss;
}

function executar_(p) {
  if (!p.chave || String(p.chave) !== chave_()) throw new Error('Chave de acesso inválida. Peça um novo link de conexão.');

  var ss = abrirPlanilha_(p.planilha);
  var abas = ss.getSheets().map(function (s) { return s.getName(); });
  var sh = p.aba ? ss.getSheetByName(p.aba) : ss.getSheets()[0];
  if (!sh) throw new Error('Aba "' + p.aba + '" não encontrada. Abas: ' + abas.join(', '));

  if (p.acao === 'ler') return ler_(ss, sh, abas);

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    if (p.acao === 'garantirColunas') return { cabecalho: garantirColunas_(sh, p.colunas || []) };
    if (p.acao === 'atualizar') return atualizar_(sh, p);
    if (p.acao === 'inserir') return inserir_(sh, p);
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
  throw new Error('Ação desconhecida: ' + p.acao);
}

function cabecalho_(sh) {
  var n = sh.getLastColumn();
  if (!n) return [];
  return sh.getRange(1, 1, 1, n).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
}

function ler_(ss, sh, abas) {
  var dados = sh.getLastRow() ? sh.getDataRange().getDisplayValues() : [];
  return {
    planilha: ss.getName(),
    aba: sh.getName(),
    abas: abas,
    cabecalho: (dados[0] || []).map(function (h) { return String(h).trim(); }),
    linhas: dados.slice(1)
  };
}

function garantirColunas_(sh, colunas) {
  var cab = cabecalho_(sh);
  var faltam = colunas.filter(function (c, i) { return c && cab.indexOf(c) < 0 && colunas.indexOf(c) === i; });
  if (faltam.length) {
    var precisa = cab.length + faltam.length - sh.getMaxColumns();
    if (precisa > 0) sh.insertColumnsAfter(sh.getMaxColumns(), precisa);
    sh.getRange(1, cab.length + 1, 1, faltam.length).setValues([faltam]).setFontWeight('bold');
    cab = cab.concat(faltam);
  }
  return cab;
}

function localizarLinha_(sh, cab, coluna, valor) {
  var ci = cab.indexOf(coluna);
  if (ci < 0 || sh.getLastRow() < 2) return -1;
  var col = sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1).getDisplayValues();
  var alvo = String(valor).trim();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]).trim() === alvo) return i + 2;
  return -1;
}

function atualizar_(sh, p) {
  var valores = p.valores || {};
  var cab = garantirColunas_(sh, Object.keys(valores));
  var linha = Number(p.linha);

  // Confere se a linha ainda é da mesma pessoa (a planilha pode ter sido reordenada).
  if (p.chaveColuna && p.chaveValor && cab.indexOf(p.chaveColuna) >= 0) {
    var ci = cab.indexOf(p.chaveColuna);
    var atual = (linha >= 2 && linha <= sh.getLastRow()) ? sh.getRange(linha, ci + 1).getDisplayValue() : null;
    if (String(atual).trim() !== String(p.chaveValor).trim()) {
      linha = localizarLinha_(sh, cab, p.chaveColuna, p.chaveValor);
      if (linha < 0) throw new Error('Registro "' + p.chaveValor + '" não encontrado na planilha.');
    }
  }
  if (!(linha >= 2)) throw new Error('Linha inválida.');

  Object.keys(valores).forEach(function (k) {
    var c = sh.getRange(linha, cab.indexOf(k) + 1);
    c.setNumberFormat('@');
    c.setValue(valores[k] == null ? '' : String(valores[k]));
  });
  return { linha: linha };
}

function inserir_(sh, p) {
  var valores = p.valores || {};
  var cab = garantirColunas_(sh, Object.keys(valores));
  if (p.chaveColuna && valores[p.chaveColuna]) {
    var existente = localizarLinha_(sh, cab, p.chaveColuna, valores[p.chaveColuna]);
    if (existente > 0) return { linha: existente, jaExistia: true }; // reenvio do mesmo cadastro (fila offline)
  }
  var linha = sh.getLastRow() + 1;
  var rg = sh.getRange(linha, 1, 1, cab.length);
  rg.setNumberFormat('@');
  rg.setValues([cab.map(function (h) { return valores[h] == null ? '' : String(valores[h]); })]);
  return { linha: linha };
}
