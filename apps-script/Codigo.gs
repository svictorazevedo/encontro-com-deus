/**
 * Encontro com Deus — API da planilha (Google Apps Script)
 *
 * Este script é a "ponte" entre o site (GitHub Pages) e a planilha no Google Drive.
 * Ele lê e grava na planilha que for informada na tela de Configuração do site.
 *
 * Como instalar (uma vez só):
 *  1. Acesse https://script.google.com  →  "Novo projeto".
 *  2. Apague o conteúdo e cole TODO este arquivo. Salve.
 *  3. Troque a CHAVE_PADRAO abaixo por uma senha sua (ou crie a propriedade
 *     do script "CHAVE" em Configurações do projeto → Propriedades do script).
 *  4. Implantar → Nova implantação → tipo "App da Web"
 *       - Executar como: Eu (sua conta)
 *       - Quem pode acessar: Qualquer pessoa
 *     Autorize o acesso quando o Google pedir.
 *  5. Copie a URL do App da Web (termina em /exec) e cole na tela de Configuração.
 *
 * A conta que implantou precisa ter acesso de edição à planilha.
 * Ao alterar este código, use Implantar → Gerenciar implantações → Editar → Nova versão.
 */

var CHAVE_PADRAO = 'TROQUE-ESTA-CHAVE';

function doGet(e) {
  return responder_((e && e.parameter) || {});
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
  return ContentService.createTextOutput(JSON.stringify(saida))
    .setMimeType(ContentService.MimeType.JSON);
}

function executar_(p) {
  var chave = PropertiesService.getScriptProperties().getProperty('CHAVE') || CHAVE_PADRAO;
  if (!p.chave || String(p.chave) !== chave) throw new Error('Chave de acesso inválida.');

  var id = extrairId_(p.planilha);
  if (!id) throw new Error('Informe o link ou o ID da planilha.');
  var ss;
  try { ss = SpreadsheetApp.openById(id); }
  catch (err) { throw new Error('Não consegui abrir a planilha. Confira o link e se a conta do script tem acesso a ela.'); }

  var abas = ss.getSheets().map(function (s) { return s.getName(); });
  var sh = p.aba ? ss.getSheetByName(p.aba) : ss.getSheets()[0];
  if (!sh) throw new Error('Aba "' + p.aba + '" não encontrada. Abas: ' + abas.join(', '));

  if (p.acao === 'ler') return ler_(ss, sh, abas);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
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

function extrairId_(v) {
  v = String(v || '').trim();
  var m = v.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : v;
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

  // Confere se a linha ainda é da mesma pessoa (alguém pode ter mexido na planilha).
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
  if (p.chaveColuna && valores[p.chaveColuna] && localizarLinha_(sh, cab, p.chaveColuna, valores[p.chaveColuna]) > 0) {
    throw new Error('Já existe um registro com ' + p.chaveColuna + ' = ' + valores[p.chaveColuna]);
  }
  var linha = sh.getLastRow() + 1;
  var rg = sh.getRange(linha, 1, 1, cab.length);
  rg.setNumberFormat('@');
  rg.setValues([cab.map(function (h) { return valores[h] == null ? '' : String(valores[h]); })]);
  return { linha: linha };
}
