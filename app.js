/* Encontro com Deus — Painel e Recepção  v2
 * App estático (GitHub Pages). Banco = planilha Google, via Apps Script (apps-script/Codigo.gs).
 * Ações gravam primeiro no aparelho (resposta instantânea) e vão para a planilha por uma fila,
 * que aguenta internet ruim: se cair, as ações esperam e são reenviadas sozinhas.
 */
'use strict';

const VERSAO = '2.0.0';
const K = { cfg: 'encontro.cfg.v1', demo: 'encontro.demo.v1', fila: 'encontro.fila.v1', cache: 'encontro.cache.v1' };
const SITE = location.origin + location.pathname;

/* ================= utilitários ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
const agora = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const hora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const MINUSC = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const titulo = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  .split(' ').map((w, i) => (i && MINUSC.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const iniciais = (n) => { const p = titulo(n).split(' ').filter((w) => !MINUSC.has(w.toLowerCase())); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
const celNacional = (s) => { let d = soDigitos(s); if (d.length >= 12 && d.startsWith('55')) d = d.slice(2); return d; };
const fmtCel = (s) => {
  const d = celNacional(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(s ?? '').trim();
};
const numero = (v) => { const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const brl = (v) => numero(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const negativo = (s) => !norm(s) || /^(n|nao|nada|nenhum|nenhuma|sem|nao tenho|nao possuo|nao uso|nao faco|x)( |$)/.test(norm(s));
function idade(s) {
  const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/) || String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [a, me, d] = m[1].length === 4 ? [+m[1], +m[2], +m[3]] : [+m[3], +m[2], +m[1]];
  const h = new Date(); let i = h.getFullYear() - a;
  if (h.getMonth() + 1 < me || (h.getMonth() + 1 === me && h.getDate() < d)) i--;
  return i >= 0 && i < 120 ? i : null;
}
const b64url = {
  cod: (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))); },
};
const ler = (k, padrao) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } };
const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio */ } };
const vibrar = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* sem suporte */ } };

/* ================= configuração ================= */
const PADRAO = {
  url: '', planilha: '', aba: '', chave: '', atendente: '', evento: '',
  valorPadrao: '145', metodosRecepcao: 'Externo, Manual, Dinheiro', mapa: {}, demo: false, nomePlanilha: '',
};
let cfg = { ...PADRAO, ...ler(K.cfg, {}) };
const salvarCfg = () => gravarLS(K.cfg, cfg);
const configurado = () => cfg.demo || !!(cfg.url && cfg.chave);

const CAMPOS = [
  { k: 'codigo', nome: 'Código', re: /^codigo$/ },
  { k: 'usado', nome: 'Usado', re: /^usado$/ },
  { k: 'nome', nome: 'Nome Completo', re: /nome completo|^nome$/ },
  { k: 'comprador', nome: 'Comprador', re: /^comprador$/ },
  { k: 'tipo', nome: 'Tipo', re: /^tipo$/ },
  { k: 'status', nome: 'Status', re: /^status$/ },
  { k: 'metodo', nome: 'Método de pagamento', re: /metodo de pagamento|forma de pagamento/ },
  { k: 'preco', nome: 'Preço do Ingresso', re: /preco|valor do ingresso/ },
  { k: 'dataCompra', nome: 'Data da Compra', re: /data da compra/ },
  { k: 'celular', nome: 'Celular', re: /^celular$|^telefone$/ },
  { k: 'celularComprador', nome: 'Celular do comprador', re: /celular do comprador/ },
  { k: 'emailComprador', nome: 'E-mail do comprador', re: /e ?mail/ },
  { k: 'igreja', nome: 'Igreja do comprador', re: /igreja do comprador/ },
  { k: 'nascimento', nome: 'Data de Nascimento', re: /nascimento/ },
  { k: 'sexo', nome: 'Sexo', re: /^sexo$/ },
  { k: 'discipulador', nome: 'Qual o nome do seu discipulador?', re: /discipulador/ },
  { k: 'lider', nome: 'Qual é o nome do(a) líder de sua célula?', re: /lider/ },
  { k: 'locomocao', nome: 'Meio de locomoção', re: /locomocao/ },
  { k: 'batizado', nome: 'Já foi batizado numa igreja evangélica?', re: /batizad/ },
  { k: 'primeiraVez', nome: 'Primeira vez no Encontro?', re: /primeira vez/ },
  { k: 'medicamento', nome: 'Medicamento contínuo', re: /medicamento/ },
  { k: 'alergia', nome: 'Alergia', re: /alergia/ },
  { k: 'restricao', nome: 'Restrição alimentar', re: /restricao/ },
  { k: 'emergencia', nome: 'Contato de emergência', re: /emergencia/ },
];
const SIS = {
  checkin: 'Check-in', checkinEm: 'Check-in em', checkinPor: 'Check-in por',
  pagoRec: 'Pago na recepção', valorRec: 'Valor recepção', pagoRecEm: 'Pago na recepção em',
  cadastroPor: 'Cadastrado na recepção por',
};
const CATS = { encontrista: 'Encontrista', equipe: 'Equipe', anjo: 'Anjo', outro: 'Outro' };
const COR_CAT = { encontrista: '#5b3fd1', equipe: '#0f8a7e', anjo: '#c9741a', outro: '#888' };
const METODOS = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito'];

/* ================= estado ================= */
const st = {
  cab: [], linhas: [], abas: [], planilha: '', aba: '', idx: {}, pessoas: [],
  base: null, carregadoEm: null, erro: null, offline: false, sincronizando: false,
  fila: ler(K.fila, []),
  filtro: 'todos', busca: '', limite: 80,
  painelGrupo: 'lider', painelCat: 'todos',
  instalar: null,
};

/* ================= acesso à planilha ================= */
class ErroRede extends Error {}

async function api(acao, dados = {}) {
  if (cfg.demo) return Demo.api(acao, dados);
  if (!cfg.url) throw new Error('Aparelho não conectado. Vá em Ajustes.');
  const corpo = JSON.stringify({ acao, chave: cfg.chave, planilha: cfg.planilha, aba: cfg.aba, ...dados });
  let r;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30000);
    // text/plain evita o "preflight" CORS, que o Apps Script não responde.
    r = await fetch(cfg.url, { method: 'POST', body: corpo, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl.signal });
    clearTimeout(t);
  } catch {
    throw new ErroRede('Sem conexão com a planilha.');
  }
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch {
    if (r.status >= 500) throw new ErroRede('O Google não respondeu. Tentando de novo…');
    throw new Error('Resposta inesperada do Apps Script. Confira a implantação ("App da Web", acesso "Qualquer pessoa").');
  }
  if (!j.ok) throw new Error(j.erro || 'Erro desconhecido.');
  return j;
}

function mapear(cab) {
  const nc = cab.map(norm);
  const idx = {};
  const usados = new Set();
  for (const c of CAMPOS) {
    const esc_ = cfg.mapa[c.k];
    if (esc_ === '-') { idx[c.k] = -1; continue; }
    let i = esc_ ? cab.indexOf(esc_) : -1;
    if (i < 0) i = nc.findIndex((h, j) => c.re.test(h) && !usados.has(j) && !Object.values(SIS).includes(cab[j]));
    idx[c.k] = i;
    if (i >= 0) usados.add(i);
  }
  for (const [k, nome] of Object.entries(SIS)) idx['sis_' + k] = cab.indexOf(nome);
  return idx;
}
const colNome = (k) => (st.idx[k] >= 0 ? st.cab[st.idx[k]] : null);
const colOuPadrao = (k) => colNome(k) || CAMPOS.find((c) => c.k === k).nome;

const metodoEhRecepcao = (m) => {
  const n = norm(m);
  return !!n && cfg.metodosRecepcao.split(',').map(norm).filter(Boolean).some((t) => n.includes(t));
};

function montarPessoa(linha, i) {
  const g = (k) => { const j = st.idx[k]; return j >= 0 ? String(linha[j] ?? '').trim() : ''; };
  const nome = titulo(g('nome') || g('comprador'));
  const codigo = g('codigo');
  if (!nome && !codigo) return null;
  const tipo = g('tipo');
  const nt = norm(tipo);
  const cat = nt.includes('anjo') ? 'anjo' : nt.includes('equipe') ? 'equipe' : nt.includes('encontrist') ? 'encontrista' : 'outro';
  const status = g('status');
  const ns = norm(status);
  const cancelado = /cancel|estorn|reembols|recusad|expirad|devolvid/.test(ns);
  const metodo = g('metodo');
  const metodoRec = g('sis_pagoRec');
  const pagoStatus = /^(pago|aprovado|confirmado|concluido)/.test(ns);
  const pago = !cancelado && (pagoStatus || !!metodoRec);
  const pagoRec = pago && (!!metodoRec || metodoEhRecepcao(metodo));
  const nb = norm(g('batizado'));
  const p = {
    linha: i + 2, codigo, nome, cat, tipo, status, metodo, cancelado, pago, pagoRec, pagoApp: pago && !pagoRec,
    batizado: /^sim/.test(nb) ? 'sim' : /^nao/.test(nb) ? 'nao' : '',
    checkin: /^sim/.test(norm(g('sis_checkin'))) || norm(g('usado')) === 'usado',
    checkinEm: g('sis_checkinEm'), checkinPor: g('sis_checkinPor'),
    metodoRec, valorRec: g('sis_valorRec'), pagoRecEm: g('sis_pagoRecEm'), cadastroPor: g('sis_cadastroPor'),
    preco: g('preco'), celular: g('celular') || g('celularComprador'), comprador: titulo(g('comprador')),
    lider: g('lider'), discipulador: g('discipulador'), sexo: g('sexo'), nascimento: g('nascimento'),
    medicamento: g('medicamento'), alergia: g('alergia'), restricao: g('restricao'), emergencia: g('emergencia'),
    locomocao: g('locomocao'), primeiraVez: g('primeiraVez'), igreja: g('igreja'),
  };
  p.saude = [p.medicamento, p.alergia, p.restricao].some((v) => !negativo(v));
  p.busca = norm([nome, p.comprador, codigo, p.lider, p.discipulador].join(' ')) + ' ' + celNacional(p.celular) + ' ' + celNacional(g('celularComprador'));
  return p;
}

function reconstruir() {
  st.idx = mapear(st.cab);
  st.pessoas = st.linhas.map(montarPessoa).filter(Boolean);
}

/* --- operações locais (otimistas) --- */
function garantirLocal(cols) {
  for (const c of cols) if (c && !st.cab.includes(c)) { st.cab.push(c); st.linhas.forEach((l) => l.push('')); }
}
function aplicarLocal(op) {
  const v = op.dados.valores || {};
  garantirLocal(Object.keys(v));
  if (op.acao === 'atualizar') {
    let li = op.dados.linha - 2;
    const ci = st.cab.indexOf(op.dados.chaveColuna);
    if (ci >= 0 && op.dados.chaveValor && String(st.linhas[li]?.[ci] ?? '').trim() !== op.dados.chaveValor) {
      li = st.linhas.findIndex((l) => String(l[ci] ?? '').trim() === op.dados.chaveValor);
    }
    if (li < 0 || !st.linhas[li]) return;
    for (const [k, val] of Object.entries(v)) st.linhas[li][st.cab.indexOf(k)] = String(val ?? '');
  } else if (op.acao === 'inserir') {
    const ci = st.cab.indexOf(op.dados.chaveColuna);
    if (ci >= 0 && st.linhas.some((l) => l[ci] === v[op.dados.chaveColuna])) return;
    st.linhas.push(st.cab.map((h) => String(v[h] ?? '')));
  } else if (op.acao === 'garantirColunas') {
    garantirLocal(op.dados.colunas || []);
  }
}

function salvarCache() {
  if (cfg.demo || !st.base) return;
  gravarLS(K.cache, { ...st.base, em: st.carregadoEm && st.carregadoEm.toISOString(), url: cfg.url });
}

function usarBase(b) {
  st.base = b;
  st.cab = [...b.cabecalho];
  st.linhas = b.linhas.map((l) => [...l]);
  st.abas = b.abas || [];
  st.planilha = b.planilha || '';
  st.aba = b.aba || '';
  for (const op of st.fila) aplicarLocal(op);
  reconstruir();
}

async function recarregar({ silencioso = false } = {}) {
  if (!configurado()) return;
  if (st.fila.length) await enviarFila();
  if (st.fila.length && st.offline) { atualizarStatus(); return; }
  girar(true);
  try {
    const r = await api('ler');
    st.carregadoEm = new Date();
    st.erro = null;
    st.offline = false;
    usarBase({ cabecalho: r.cabecalho || [], linhas: r.linhas || [], abas: r.abas, planilha: r.planilha, aba: r.aba });
    if (r.planilha && cfg.nomePlanilha !== r.planilha) { cfg.nomePlanilha = r.planilha; salvarCfg(); }
    salvarCache();
  } catch (e) {
    if (e instanceof ErroRede) st.offline = true;
    else st.erro = e.message;
    if (!silencioso) toast(e.message, 'erro');
  } finally {
    girar(false);
  }
  renderizar();
}

/* --- fila de envio --- */
const salvarFila = () => gravarLS(K.fila, st.fila);
let timerFila = null;

function enfileirar(acao, dados) {
  const op = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), acao, dados };
  aplicarLocal(op);
  st.fila.push(op);
  salvarFila();
  reconstruir();
  renderizar();
  enviarFila();
}

async function enviarFila() {
  if (st.sincronizando || !st.fila.length) { atualizarStatus(); return; }
  st.sincronizando = true;
  atualizarStatus();
  let teveErro = false;
  try {
    while (st.fila.length) {
      const op = st.fila[0];
      try {
        await api(op.acao, op.dados);
        st.offline = false;
      } catch (e) {
        if (e instanceof ErroRede) {
          st.offline = true;
          clearTimeout(timerFila);
          timerFila = setTimeout(enviarFila, 15000);
          break;
        }
        teveErro = true;
        toast('Não foi gravado na planilha: ' + e.message, 'erro');
      }
      st.fila.shift();
      salvarFila();
    }
  } finally {
    st.sincronizando = false;
    atualizarStatus();
    renderizarSoft();
  }
  if (teveErro) recarregar({ silencioso: true });
}

/* ================= ações ================= */
const acharPessoa = (linha) => st.pessoas.find((p) => p.linha === Number(linha));
const refPessoa = (p) => ({ linha: p.linha, chaveColuna: p.codigo ? colNome('codigo') : '', chaveValor: p.codigo });
const atualizar = (p, valores) => enfileirar('atualizar', { ...refPessoa(p), valores });

function valoresCheckin(sim) {
  const v = {
    [SIS.checkin]: sim ? 'Sim' : '',
    [SIS.checkinEm]: sim ? agora() : '',
    [SIS.checkinPor]: sim ? (cfg.atendente || 'Recepção') : '',
  };
  const u = colNome('usado');
  if (u) v[u] = sim ? 'Usado' : 'Não Usado';
  return v;
}
function valoresPagamento(metodo, valor) {
  const v = { [SIS.pagoRec]: metodo, [SIS.valorRec]: valor, [SIS.pagoRecEm]: agora() };
  const s = colNome('status');
  if (s) v[s] = 'Pago';
  return v;
}

function comemorar(txt) {
  vibrar([30, 40, 30]);
  const el = $('#sucesso');
  $('#sucessoTxt').textContent = txt;
  el.hidden = false;
  clearTimeout(comemorar.t);
  comemorar.t = setTimeout(() => { el.hidden = true; }, 850);
}

async function fazerCheckin(p) {
  if (p.checkin) return abrirFicha(p);
  if (!p.pago && !p.cancelado) {
    const r = await folha({
      titulo: 'Pagamento pendente',
      corpo: `${cabecalhoPessoa(p)}
        <div class="aviso">Esta pessoa ainda <b>não pagou</b>${p.status ? ` (status: ${esc(p.status)})` : ''}.</div>
        <div class="form">${camposPagamento(p)}</div>`,
      botoes: [{ v: 'so', t: 'Só check-in' }, { v: 'pagar', t: 'Receber e entrar', cls: 'ok' }],
      ler: (f) => ({ metodo: f.metodo.value, valor: f.valor.value.trim() }),
    });
    if (!r) return;
    if (r.v === 'pagar') {
      atualizar(p, { ...valoresPagamento(r.dados.metodo, r.dados.valor), ...valoresCheckin(true) });
      comemorar(`${primeiroNome(p)} pagou e entrou!`);
      toast(`Pagamento (${r.dados.metodo}) + check-in de ${p.nome}`, 'ok', desfazerCom(p, { pag: true, chk: true }));
      return;
    }
  }
  atualizar(p, valoresCheckin(true));
  comemorar(`Bem-vindo(a), ${primeiroNome(p)}!`);
  toast(`Check-in de ${p.nome}`, 'ok', desfazerCom(p, { chk: true }));
  limparBuscaAposAcao();
}
const primeiroNome = (p) => p.nome.split(' ')[0];

function desfazerCom(p, { pag, chk }) {
  return {
    rotulo: 'Desfazer',
    fn: () => {
      const atual = acharPessoaPorCodigo(p) || p;
      const v = {};
      if (chk) Object.assign(v, valoresCheckin(false));
      if (pag) Object.assign(v, valoresSemPagamento());
      atualizar(atual, v);
      toast('Desfeito.');
    },
  };
}
const acharPessoaPorCodigo = (p) => (p.codigo ? st.pessoas.find((x) => x.codigo === p.codigo) : acharPessoa(p.linha));
function valoresSemPagamento() {
  const v = { [SIS.pagoRec]: '', [SIS.valorRec]: '', [SIS.pagoRecEm]: '' };
  const s = colNome('status');
  if (s) v[s] = 'Pendente';
  return v;
}

function limparBuscaAposAcao() {
  if (!st.busca) return;
  st.busca = '';
  $('#busca').value = '';
  $('#limparBusca').hidden = true;
  renderRecepcao();
  if (matchMedia('(min-width: 900px)').matches) $('#busca').focus();
}

function camposPagamento(p) {
  return `<div><div class="rotulo-grupo">Forma de pagamento</div>
      <div class="opcoes">${METODOS.map((m, i) => `<input type="radio" name="metodo" id="met${i}" value="${m}" ${i === 1 ? 'checked' : ''}><label for="met${i}">${m}</label>`).join('')}</div></div>
    <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${esc(p?.preco || cfg.valorPadrao)}"></label>`;
}

async function receberPagamento(p) {
  const r = await folha({
    titulo: 'Receber pagamento',
    corpo: `${cabecalhoPessoa(p)}<div class="form">${camposPagamento(p)}
      ${p.checkin ? '' : `<label class="interruptor">Fazer check-in junto <input type="checkbox" name="checkin" checked></label>`}</div>`,
    botoes: [{ v: 'ok', t: 'Confirmar pagamento', cls: 'ok' }],
    ler: (f) => ({ metodo: f.metodo.value, valor: f.valor.value.trim(), checkin: !!(f.checkin && f.checkin.checked) }),
  });
  if (!r) return;
  const v = valoresPagamento(r.dados.metodo, r.dados.valor);
  if (r.dados.checkin) Object.assign(v, valoresCheckin(true));
  atualizar(p, v);
  comemorar(r.dados.checkin ? `${primeiroNome(p)} pagou e entrou!` : 'Pagamento registrado');
  toast(`${r.dados.metodo} · ${brl(r.dados.valor)} — ${p.nome}`, 'ok', desfazerCom(p, { pag: true, chk: r.dados.checkin }));
}

async function confirmar(tituloTxt, html, rotulo, cls = 'perigo') {
  const r = await folha({ titulo: tituloTxt, corpo: html, botoes: [{ v: 'sim', t: rotulo, cls }] });
  return r === 'sim';
}

/* --- ficha da pessoa --- */
function cabecalhoPessoa(p) {
  return `<div class="ficha-topo"><div class="avatar av-${p.cat}">${esc(iniciais(p.nome))}</div>
    <div><div class="ficha-nome">${esc(p.nome)}</div><div class="p-selos">${selos(p, true)}</div></div></div>`;
}

function linkWhats(cel, texto = '') {
  const d = celNacional(cel);
  if (d.length < 10) return '';
  return `https://wa.me/55${d}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
}

async function abrirFicha(p) {
  const id = idade(p.nascimento);
  const linhas = [
    ['Tipo', p.tipo || CATS[p.cat]],
    ['Celular', fmtCel(p.celular)],
    ['Líder de célula', p.lider && titulo(p.lider)],
    ['Discipulador(a)', p.discipulador && titulo(p.discipulador)],
    ['Idade', id != null ? `${id} anos` : ''],
    ['Sexo', p.sexo],
    ['Batizado', p.batizado === 'sim' ? 'Sim' : p.batizado === 'nao' ? 'Não' : ''],
    ['Primeira vez', p.primeiraVez && (/^sim/.test(norm(p.primeiraVez)) ? 'Sim' : /^nao/.test(norm(p.primeiraVez)) ? 'Não' : p.primeiraVez)],
    ['Medicamento', p.medicamento, !negativo(p.medicamento)],
    ['Alergia', p.alergia, !negativo(p.alergia)],
    ['Restrição alimentar', p.restricao, !negativo(p.restricao)],
    ['Emergência', p.emergencia],
    ['Locomoção', p.locomocao],
    ['Pagamento', p.pagoRec ? `Recepção · ${p.metodoRec || p.metodo}${p.valorRec ? ' · ' + brl(p.valorRec) : ''}${p.pagoRecEm ? ' · ' + p.pagoRecEm : ''}` : p.pago ? `App · ${p.metodo}${p.preco ? ' · ' + brl(p.preco) : ''}` : (p.status || 'Pendente')],
    ['Check-in', p.checkinEm && `${p.checkinEm}${p.checkinPor ? ' · ' + p.checkinPor : ''}`],
    ['Comprador', p.comprador && norm(p.comprador) !== norm(p.nome) ? p.comprador : ''],
    ['Código', p.codigo],
  ].filter(([, v]) => v);
  const wa = linkWhats(p.celular);
  const r = await folha({
    titulo: 'Ficha',
    corpo: `${cabecalhoPessoa(p)}
      <div class="acoes-grade">
        ${p.cancelado ? '' : p.checkin
          ? `<button class="btn larga" value="descheckin">Desfazer check-in</button>`
          : `<button class="btn ok larga" value="checkin">✓ Fazer check-in</button>`}
        ${!p.pago && !p.cancelado ? `<button class="btn suave larga" value="pagar">Receber pagamento</button>` : ''}
        ${p.celular ? `<a class="btn" href="tel:+55${celNacional(p.celular)}">Ligar</a>` : ''}
        ${wa ? `<a class="btn" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </div>
      <div class="dados">${linhas.map(([k, v, dest]) => `<div class="${dest ? 'destaque' : ''}"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>
      ${p.metodoRec ? `<button class="btn perigo peq" value="estornar">Desfazer pagamento da recepção</button>` : ''}`,
  });
  if (r === 'checkin') return fazerCheckin(p);
  if (r === 'pagar') return receberPagamento(p);
  if (r === 'descheckin' && await confirmar('Desfazer check-in', `<p>Remover a presença de <b>${esc(p.nome)}</b>?</p>`, 'Desfazer check-in')) {
    atualizar(p, valoresCheckin(false)); toast('Check-in desfeito.');
  }
  if (r === 'estornar' && await confirmar('Desfazer pagamento', `<p>Remover o pagamento registrado na recepção para <b>${esc(p.nome)}</b>?</p>`, 'Desfazer pagamento')) {
    atualizar(p, valoresSemPagamento()); toast('Pagamento desfeito.');
  }
}

/* --- cadastro --- */
function nomesExistentes(k) {
  const m = new Map();
  for (const p of st.pessoas) { const n = p[k]; if (n && !m.has(chaveNome(n))) m.set(chaveNome(n), titulo(n)); }
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((n) => `<option value="${esc(n)}">`).join('');
}
const radios = (nome, opcoes, marcado) => `<div class="opcoes">${opcoes.map(([v, t], i) =>
  `<input type="radio" name="${nome}" id="${nome}${i}" value="${esc(v)}" ${v === marcado ? 'checked' : ''}><label for="${nome}${i}">${esc(t)}</label>`).join('')}</div>`;

async function novoCadastro(nomeInicial = '') {
  if (!configurado()) { irPara('ajustes'); toast('Conecte o aparelho à planilha primeiro.'); return; }
  const r = await folha({
    titulo: 'Novo cadastro',
    corpo: `<div class="form">
      <label class="campo">Nome completo<input name="nome" value="${esc(nomeInicial)}" autocomplete="off" autocapitalize="words" required></label>
      <div><div class="rotulo-grupo">Tipo</div>${radios('cat', [['encontrista', 'Encontrista'], ['equipe', 'Equipe'], ['anjo', 'Anjo']], 'encontrista')}</div>
      <div class="duas-col">
        <label class="campo">Celular<input name="celular" type="tel" inputmode="tel" placeholder="(65) 99999-9999"></label>
        <label class="campo">Nascimento<input name="nascimento" type="date"></label>
      </div>
      <div><div class="rotulo-grupo">Sexo</div>${radios('sexo', [['Masculino', 'Masculino'], ['Feminino', 'Feminino']], '')}</div>
      <label class="campo">Líder de célula<input name="lider" list="dlLider" autocomplete="off" autocapitalize="words"></label>
      <label class="campo">Discipulador(a)<input name="discipulador" list="dlDisc" autocomplete="off" autocapitalize="words"></label>
      <div class="duas-col">
        <div><div class="rotulo-grupo">Batizado(a)?</div>${radios('batizado', [['sim', 'Sim'], ['nao', 'Não']], '')}</div>
        <div><div class="rotulo-grupo">1ª vez no Encontro?</div>${radios('primeira', [['sim', 'Sim'], ['nao', 'Não']], '')}</div>
      </div>
      <details class="avancado"><summary>Saúde e emergência</summary><div class="form" style="margin-top:10px">
        <label class="campo">Medicamento contínuo<input name="medicamento"></label>
        <label class="campo">Alergia<input name="alergia"></label>
        <label class="campo">Restrição alimentar<input name="restricao"></label>
        <label class="campo">Contato de emergência (nome e telefone)<input name="emergencia"></label>
      </div></details>
      <div><div class="rotulo-grupo">Pagamento</div>${radios('pagamento', [['', 'Não pagou'], ...METODOS.map((m) => [m, m])], '')}</div>
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${esc(cfg.valorPadrao)}"></label>
      <label class="interruptor">Já fazer check-in <input type="checkbox" name="checkin" checked></label>
    </div>
    <datalist id="dlDisc">${nomesExistentes('discipulador')}</datalist>
    <datalist id="dlLider">${nomesExistentes('lider')}</datalist>`,
    botoes: [{ v: 'ok', t: 'Cadastrar', cls: 'primario' }],
    ler: (f) => {
      const d = {};
      for (const [k, v] of new FormData(f)) d[k] = String(v).trim();
      d.checkin = f.checkin.checked;
      return d;
    },
    validar: (d) => (d.nome.length < 3 ? 'Informe o nome completo.' : ''),
  });
  if (!r) return;
  const d = r.dados;
  const nome = titulo(d.nome);
  const dup = st.pessoas.find((p) => norm(p.nome) === norm(nome));
  if (dup && !await confirmar('Já existe alguém com esse nome',
    `${cabecalhoPessoa(dup)}<p>Cadastrar outra pessoa com o mesmo nome mesmo assim?</p>`, 'Cadastrar mesmo assim', 'primario')) return;

  const codigo = 'R' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4);
  const v = {
    [colOuPadrao('codigo')]: codigo,
    [colOuPadrao('nome')]: nome,
    [colOuPadrao('tipo')]: `${CATS[d.cat || 'encontrista']} | Recepção`,
    [colOuPadrao('status')]: d.pagamento ? 'Pago' : 'Pendente',
    [colOuPadrao('dataCompra')]: agora(),
    [colOuPadrao('celular')]: d.celular,
    [colOuPadrao('sexo')]: d.sexo || '',
    [colOuPadrao('nascimento')]: d.nascimento ? d.nascimento.split('-').reverse().join('/') : '',
    [colOuPadrao('discipulador')]: d.discipulador,
    [colOuPadrao('lider')]: d.lider,
    [colOuPadrao('batizado')]: d.batizado === 'sim' ? 'Sim, ja fui batizado em uma igreja evangélica' : d.batizado === 'nao' ? 'Não sou batizado em igreja evangélica' : '',
    [colOuPadrao('primeiraVez')]: d.primeira === 'sim' ? 'Sim, é minha primeira vez' : d.primeira === 'nao' ? 'Não, já fui em outro Encontro' : '',
    [colOuPadrao('medicamento')]: d.medicamento || '',
    [colOuPadrao('alergia')]: d.alergia || '',
    [colOuPadrao('restricao')]: d.restricao || '',
    [colOuPadrao('emergencia')]: d.emergencia || '',
    [SIS.cadastroPor]: cfg.atendente || 'Recepção',
  };
  if (colNome('comprador')) v[colNome('comprador')] = nome;
  if (colNome('usado')) v[colNome('usado')] = 'Não Usado';
  if (d.pagamento) {
    Object.assign(v, valoresPagamento(d.pagamento, d.valor));
    v[colOuPadrao('metodo')] = `${d.pagamento} (recepção)`;
    v[colOuPadrao('preco')] = d.valor;
  }
  if (d.checkin) Object.assign(v, valoresCheckin(true));
  enfileirar('inserir', { valores: v, chaveColuna: colOuPadrao('codigo') });
  comemorar(d.checkin ? `${nome.split(' ')[0]} cadastrado(a) e presente!` : 'Cadastro feito!');
  toast(`${nome} cadastrado(a)`, 'ok');
  if (telaAtual() !== 'recepcao') irPara('recepcao');
  st.busca = ''; $('#busca').value = ''; $('#limparBusca').hidden = true;
  renderRecepcao();
}

/* ================= painel ================= */
const TITULOS = /^(pr|pra|pastor|pastora|obr|obra|obreiro|obreira|ap|apostolo|apostola|bispo|bispa|ev|evangelista|miss|missionario|missionaria|dc|diacono|diaconisa|lider|irmao|irma|ir)\s+/;
function chaveNome(s) {
  let n = norm(s);
  while (TITULOS.test(n)) n = n.replace(TITULOS, '');
  return n;
}
function agrupar(lista, k) {
  const m = new Map();
  for (const p of lista) {
    const original = String(p[k] || '').trim();
    const chave = chaveNome(original) || '~';
    if (!m.has(chave)) m.set(chave, { chave, variantes: new Map(), pessoas: [] });
    const g = m.get(chave);
    g.pessoas.push(p);
    if (original) g.variantes.set(original, (g.variantes.get(original) || 0) + 1);
  }
  return [...m.values()].map((g) => {
    const melhor = [...g.variantes.entries()].sort((a, b) => b[1] - a[1])[0];
    return { nome: g.chave === '~' ? 'Não informado' : titulo(melhor[0]), vazio: g.chave === '~', pessoas: g.pessoas };
  }).sort((a, b) => (a.vazio - b.vazio) || (b.pessoas.length - a.pessoas.length) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function kpi(rot, val, det, cls, filtro) {
  const tag = filtro ? 'button' : 'div';
  return `<${tag} class="kpi ${cls || ''}" ${filtro ? `data-ir-filtro="${filtro}"` : ''}>
    <div class="rot"><i></i>${esc(rot)}</div><div class="val">${val}</div>${det ? `<div class="det">${det}</div>` : ''}</${tag}>`;
}

function renderPainel() {
  const el = $('#tela-painel');
  if (!configurado()) { el.innerHTML = cartaoConectar(); return; }
  if (!st.base) { el.innerHTML = st.erro ? `<div class="aviso erro">${esc(st.erro)}</div>` : esqueleto(); return; }
  const ativos = st.pessoas.filter((p) => !p.cancelado);
  const canc = st.pessoas.length - ativos.length;
  const n = (f) => ativos.filter(f).length;
  const tot = ativos.length;
  const c = { encontrista: n((p) => p.cat === 'encontrista'), equipe: n((p) => p.cat === 'equipe'), anjo: n((p) => p.cat === 'anjo'), outro: n((p) => p.cat === 'outro') };
  const pres = n((p) => p.checkin);
  const presCat = (k) => n((p) => p.cat === k && p.checkin);
  const pagos = n((p) => p.pago), nao = tot - pagos, app = n((p) => p.pagoApp), rec = n((p) => p.pagoRec);
  const bat = n((p) => p.batizado === 'sim'), nbat = n((p) => p.batizado === 'nao'), sbat = tot - bat - nbat;
  const totRec = ativos.filter((p) => p.pagoRec && p.valorRec).reduce((s, p) => s + numero(p.valorRec), 0);
  const naoPagos = ativos.filter((p) => !p.pago).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const lista = st.painelCat === 'todos' ? ativos : ativos.filter((p) => p.cat === st.painelCat);
  const grupos = agrupar(lista, st.painelGrupo);
  const max = Math.max(1, ...grupos.map((g) => g.pessoas.length));

  el.innerHTML = `
    ${st.erro ? `<div class="aviso erro">${esc(st.erro)}</div>` : ''}
    <div class="cartao">
      <div class="hero">
        <div class="anel" style="--p:${pct(pres, tot)}"><div>${pct(pres, tot)}%</div></div>
        <div class="hero-txt">
          <div class="muted peq">Presentes no Encontro</div>
          <div class="grande">${pres}<span> de ${tot}</span></div>
          <div class="muted peq">${['encontrista', 'equipe', 'anjo'].filter((k) => c[k]).map((k) => `${CATS[k]}s ${presCat(k)}/${c[k]}`).join(' · ')}</div>
        </div>
      </div>
    </div>

    <div class="secao">Inscritos</div>
    <div class="kpis">
      ${kpi('Encontristas', c.encontrista, `${pct(c.encontrista, tot)}% do total`, 'pri', 'cat:encontrista')}
      ${kpi('Equipe', c.equipe, `${pct(c.equipe, tot)}% do total`, '', 'cat:equipe')}
      ${kpi('Anjos', c.anjo, c.outro ? `${c.outro} sem tipo reconhecido` : `${pct(c.anjo, tot)}% do total`, 'alerta', 'cat:anjo')}
      ${kpi('Total', tot, canc ? `${canc} cancelado(s) fora da conta` : 'inscrições ativas', 'azul', 'todos')}
    </div>

    <div class="secao">Pagamento</div>
    <div class="kpis">
      ${kpi('Pagos', pagos, `${pct(pagos, tot)}%`, 'ok', 'pagos')}
      ${kpi('Não pagos', nao, nao ? 'toque para ver' : 'ninguém devendo', nao ? 'erro' : '', 'naopagos')}
      ${kpi('Pagos no app', app, `${pct(app, pagos)}% dos pagos`, 'pri', 'app')}
      ${kpi('Pagos na recepção', rec, totRec ? `${brl(totRec)} recebidos` : `${pct(rec, pagos)}% dos pagos`, 'alerta', 'rec')}
    </div>
    <div class="cartao" style="margin-top:10px">
      <div class="barra-dupla">
        <span style="width:${pct(app, tot)}%;background:var(--pri)"></span>
        <span style="width:${pct(rec, tot)}%;background:var(--alerta)"></span>
        <span style="width:${pct(nao, tot)}%;background:var(--erro)"></span>
      </div>
      <div class="legenda"><span><i style="background:var(--pri)"></i>App ${app}</span><span><i style="background:var(--alerta)"></i>Recepção ${rec}</span><span><i style="background:var(--erro)"></i>Não pagos ${nao}</span></div>
    </div>

    <div class="secao">Batismo</div>
    <div class="kpis">
      ${kpi('Batizados', bat, `${pct(bat, tot)}%`, 'ok', 'bat')}
      ${kpi('Não batizados', nbat, `${pct(nbat, tot)}%${sbat ? ` · ${sbat} sem resposta` : ''}`, 'erro', 'naobat')}
    </div>

    <div class="painel-grade" style="margin-top:20px">
      <div class="cartao">
        <div class="cartao-topo"><h2>Não pagos <span class="muted">(${naoPagos.length})</span></h2>
          ${naoPagos.length ? '<a class="btn peq suave" href="#naopagos">Abrir na recepção</a>' : ''}</div>
        ${naoPagos.length ? `<div class="lista">${naoPagos.map((p) => cartaoPessoa(p, true)).join('')}</div>`
          : '<div class="vazio">Todos pagos 🎉</div>'}
      </div>
      <div class="cartao">
        <div class="cartao-topo"><h2>Quantidade por…</h2></div>
        <div class="segmentado" style="margin-bottom:10px">
          <button data-painel-grupo="lider" class="${st.painelGrupo === 'lider' ? 'ativo' : ''}">Líder de célula</button>
          <button data-painel-grupo="discipulador" class="${st.painelGrupo === 'discipulador' ? 'ativo' : ''}">Discipulado</button>
        </div>
        <div class="chips rolavel" style="margin:0 -16px 8px;padding:0 16px">
          ${['todos', 'encontrista', 'equipe', 'anjo'].map((k) => `<button class="chip ${st.painelCat === k ? 'ativo' : ''}" data-painel-cat="${k}">${k === 'todos' ? 'Todos' : CATS[k] + 's'}</button>`).join('')}
        </div>
        <div class="muted peq" style="margin-bottom:4px">${grupos.filter((g) => !g.vazio).length} ${st.painelGrupo === 'lider' ? 'líderes' : 'discipuladores'} · ${lista.length} pessoas · toque para ver os nomes</div>
        ${grupos.map((g) => {
          const porCat = ['encontrista', 'equipe', 'anjo', 'outro'].map((k) => [k, g.pessoas.filter((p) => p.cat === k).length]).filter(([, q]) => q);
          return `<details class="grupo"><summary>
            <span class="g-nome">${esc(g.nome)}</span><span class="g-qtd">${g.pessoas.length}</span>
            <span class="g-barra">${porCat.map(([k, q]) => `<span style="width:${(q / max) * 100}%;background:${COR_CAT[k]}"></span>`).join('')}</span>
            <span class="g-det">${porCat.map(([k, q]) => `${q} ${CATS[k].toLowerCase()}${q > 1 ? 's' : ''}`).join(' · ')} · ${g.pessoas.filter((p) => p.checkin).length} presentes</span>
          </summary><div class="g-pessoas">${g.pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((p) => `<button data-ficha="${p.linha}">${p.checkin ? '✓ ' : ''}${esc(p.nome)}</button>`).join('')}</div></details>`;
        }).join('') || '<div class="vazio">Sem dados</div>'}
      </div>
    </div>`;
}

const esqueleto = () => `<div class="vazio">Carregando a planilha…</div>`;

/* ================= recepção ================= */
const FILTROS = {
  todos: { t: 'Todos', f: () => true },
  semcheckin: { t: 'Sem check-in', f: (p) => !p.checkin && !p.cancelado },
  presentes: { t: 'Presentes', f: (p) => p.checkin },
  naopagos: { t: 'Não pagos', f: (p) => !p.pago && !p.cancelado },
  'cat:encontrista': { t: 'Encontristas', f: (p) => p.cat === 'encontrista' && !p.cancelado },
  'cat:equipe': { t: 'Equipe', f: (p) => p.cat === 'equipe' && !p.cancelado },
  'cat:anjo': { t: 'Anjos', f: (p) => p.cat === 'anjo' && !p.cancelado },
  saude: { t: 'Saúde ⚕', f: (p) => p.saude && !p.cancelado },
  pagos: { t: 'Pagos', f: (p) => p.pago, extra: true },
  app: { t: 'Pagos no app', f: (p) => p.pagoApp, extra: true },
  rec: { t: 'Pagos na recepção', f: (p) => p.pagoRec, extra: true },
  bat: { t: 'Batizados', f: (p) => p.batizado === 'sim' && !p.cancelado, extra: true },
  naobat: { t: 'Não batizados', f: (p) => p.batizado === 'nao' && !p.cancelado, extra: true },
};

function filtrar() {
  const termo = norm(st.busca);
  const dig = soDigitos(st.busca);
  let l = st.pessoas.filter((FILTROS[st.filtro] || FILTROS.todos).f);
  if (termo) {
    const partes = termo.split(' ');
    l = l.filter((p) => partes.every((t) => p.busca.includes(t)) || (dig.length >= 4 && p.busca.includes(dig)));
  }
  return l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function selos(p, completo = false) {
  const s = [];
  if (completo || p.cat !== 'encontrista') s.push(`<span class="selo" style="background:${COR_CAT[p.cat]}22;color:${COR_CAT[p.cat]}">${CATS[p.cat]}</span>`);
  if (p.cancelado) s.push(`<span class="selo">${esc(p.status)}</span>`);
  else if (!p.pago) s.push('<span class="selo erro">Não pago</span>');
  else if (p.pagoRec) s.push('<span class="selo alerta">Pago recepção</span>');
  else if (completo) s.push('<span class="selo ok">Pago no app</span>');
  if (p.checkin) s.push(`<span class="selo ok">Presente${p.checkinEm ? ' ' + esc(p.checkinEm.split(' ')[1] || '') : ''}</span>`);
  if (p.saude) s.push('<span class="selo azul">⚕ Saúde</span>');
  return s.join('');
}

function cartaoPessoa(p, semBotao = false) {
  const info = [p.lider && titulo(p.lider), fmtCel(p.celular)].filter(Boolean).join(' · ');
  const pend = st.fila.some((op) => op.dados.chaveValor && op.dados.chaveValor === p.codigo);
  return `<div class="pessoa ${p.checkin ? 'presente' : ''} ${pend ? 'pendente-sync' : ''}" data-ficha="${p.linha}">
    <div class="avatar av-${p.cat}">${esc(iniciais(p.nome))}</div>
    <div class="p-meio">
      <div class="p-nome">${esc(p.nome)}</div>
      ${info ? `<div class="p-info">${esc(info)}</div>` : ''}
      <div class="p-selos">${selos(p)}</div>
    </div>
    ${semBotao || p.cancelado ? '' : `<button class="check-btn ${p.checkin ? 'feito' : ''}" data-checkin="${p.linha}" aria-label="${p.checkin ? 'Presente' : 'Fazer check-in'}">
      <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`}
  </div>`;
}

function renderRecepcao() {
  const el = $('#listaRecepcao');
  const topo = $('.recepcao-topo');
  if (!configurado()) { topo.hidden = true; el.innerHTML = cartaoConectar(); return; }
  topo.hidden = false;
  if (!st.base) { el.innerHTML = st.erro ? `<div class="aviso erro">${esc(st.erro)}</div>` : esqueleto(); return; }

  const ativos = st.pessoas.filter((p) => !p.cancelado);
  const pres = ativos.filter((p) => p.checkin).length;
  $('#progressoPresenca').innerHTML = `<span><b>${pres}</b> de ${ativos.length} presentes</span><span class="trilho"><span style="width:${pct(pres, ativos.length)}%"></span></span><span>${pct(pres, ativos.length)}%</span>`;

  const vis = Object.entries(FILTROS).filter(([k, f]) => !f.extra || k === st.filtro);
  $('#filtrosRecepcao').innerHTML = vis.map(([k, f]) =>
    `<button class="chip ${st.filtro === k ? 'ativo' : ''}" data-filtro="${k}">${f.t}<b>${st.pessoas.filter(f.f).length}</b></button>`).join('');

  const l = filtrar();
  if (!l.length) {
    el.innerHTML = `<div class="vazio">
      <div>${st.busca ? `Ninguém encontrado para “${esc(st.busca)}”` : 'Ninguém nesta lista.'}</div>
      ${st.filtro !== 'todos' ? '<button class="btn" data-filtro="todos">Ver todos</button>' : ''}
      <button class="btn primario" data-acao="novoCadastro" data-nome="${esc(st.busca)}">+ Cadastrar ${st.busca ? esc(titulo(st.busca)) : 'nova pessoa'}</button></div>`;
    return;
  }
  el.innerHTML = l.slice(0, st.limite).map((p) => cartaoPessoa(p)).join('') +
    (l.length > st.limite ? `<button class="btn bloco" data-acao="maisResultados">Mostrar mais (${l.length - st.limite})</button>` : '');
}

/* ================= ajustes ================= */
function linkConexao() {
  return SITE + '#conectar=' + b64url.cod({ u: cfg.url, k: cfg.chave, p: cfg.planilha || undefined, a: cfg.aba || undefined, n: cfg.nomePlanilha || st.planilha || undefined });
}

function cartaoConectar() {
  return `<div class="cartao">
    <h2>Conectar este aparelho</h2>
    <p class="muted">Peça ao responsável o <b>link de conexão</b> (na planilha: menu <i>Encontro com Deus → Conectar celulares</i>) e abra-o neste aparelho. Ou cole o link aqui:</p>
    <div class="form">
      <input id="colarLink" placeholder="Cole o link de conexão" autocomplete="off">
      <button class="btn primario bloco" data-acao="usarLink">Conectar</button>
      <button class="btn bloco" data-acao="ativarDemo">Ver demonstração com dados fictícios</button>
    </div>
  </div>`;
}

function renderAjustes() {
  const el = $('#tela-ajustes');
  const conectado = configurado() && !cfg.demo;
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  el.innerHTML = `
    ${cfg.demo ? `<div class="aviso">Você está no <b>modo demonstração</b>. Para usar de verdade, conecte o aparelho à planilha abaixo.</div>` : ''}
    ${conectado ? `
      <div class="cartao">
        <div class="estado">
          <div class="bola ${st.erro ? 'erro' : ''}"><svg viewBox="0 0 24 24">${st.erro ? '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>' : '<path d="M5 12.5l4.5 4.5L19 7.5"/>'}</svg></div>
          <div style="min-width:0"><b>${esc(cfg.nomePlanilha || st.planilha || 'Planilha conectada')}</b>
            <div class="muted peq">${st.erro ? esc(st.erro) : st.base ? `${st.pessoas.length} registros · ${st.aba ? 'aba ' + esc(st.aba) + ' · ' : ''}${st.carregadoEm ? 'atualizado às ' + hora(st.carregadoEm) : 'dados guardados no aparelho'}` : 'Carregando…'}</div></div>
        </div>
      </div>` : cartaoConectar()}

    ${configurado() ? `
    <div class="cartao form">
      <label class="campo">Nome deste aparelho / atendente <span class="muted" style="font-weight:400">vai para a planilha em cada check-in</span>
        <input id="cfgAtendente" value="${esc(cfg.atendente)}" placeholder="Ex.: Mesa 1 — Ana"></label>
      ${conectado ? `<button class="btn suave bloco" data-acao="compartilhar">Conectar outro celular (enviar link)</button>` : ''}
      ${instalado ? '' : st.instalar ? `<button class="btn primario bloco" data-acao="instalar">Instalar como aplicativo</button>`
        : `<div class="muted peq">Para usar como aplicativo: ${ios ? 'no Safari, toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.' : 'no menu do navegador (⋮), toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.'}</div>`}
    </div>` : ''}

    <div class="cartao">
      <details class="avancado" ${!configurado() ? '' : ''}><summary>Configuração avançada</summary>
        <form id="formAvancado" class="form" style="margin-top:12px">
          <label class="campo">URL do Apps Script (termina em /exec)<input name="url" value="${esc(cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
          <label class="campo">Chave de acesso<input name="chave" type="password" value="${esc(cfg.chave)}" autocomplete="off"></label>
          <label class="campo">Link da planilha <span class="muted" style="font-weight:400">(vazio = a planilha onde o script foi instalado)</span><input name="planilha" value="${esc(cfg.planilha)}" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
          <label class="campo">Aba<select name="aba"><option value="">Primeira aba</option>${(st.abas.length ? st.abas : cfg.aba ? [cfg.aba] : []).map((a) => `<option ${a === cfg.aba ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
          <div class="duas-col">
            <label class="campo">Título do app<input name="evento" value="${esc(cfg.evento)}" placeholder="Encontro com Deus"></label>
            <label class="campo">Valor do ingresso (R$)<input name="valorPadrao" inputmode="decimal" value="${esc(cfg.valorPadrao)}"></label>
          </div>
          <label class="campo">Métodos da planilha que contam como "pago na recepção" (vírgula)<input name="metodosRecepcao" value="${esc(cfg.metodosRecepcao)}"></label>
          <button class="btn primario bloco" type="submit">Salvar e testar conexão</button>
        </form>
        ${st.cab.length ? `
          <h3 style="margin-top:20px">Colunas da planilha</h3>
          <p class="muted peq">Reconhecidas automaticamente pelo nome. Ajuste só se algo não bater.</p>
          <div class="mapa">${CAMPOS.map((c) => {
            const atual = st.idx[c.k] >= 0 ? st.cab[st.idx[c.k]] : '';
            return `<label class="campo">${esc(c.nome)}<select data-campo="${c.k}">
              <option value="">${atual && !cfg.mapa[c.k] ? 'Auto → ' + esc(atual) : 'Auto (não encontrada)'}</option>
              <option value="-" ${cfg.mapa[c.k] === '-' ? 'selected' : ''}>(não usar)</option>
              ${st.cab.map((h) => `<option value="${esc(h)}" ${cfg.mapa[c.k] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}
            </select></label>`;
          }).join('')}</div>
          <div class="linha-botoes" style="margin-top:12px">
            <button class="btn" data-acao="salvarMapa">Salvar colunas</button>
            <button class="btn" data-acao="prepararColunas">Criar colunas de controle</button>
          </div>` : ''}
      </details>
    </div>

    <div class="cartao">
      <details class="avancado"><summary>Instalar o Apps Script na planilha (responsável)</summary>
        <ol class="passos">
          <li>Abra a planilha no Google Planilhas → <b>Extensões → Apps Script</b>.</li>
          <li>Apague o conteúdo, cole o código (botão abaixo) e salve.</li>
          <li><b>Implantar → Nova implantação → App da Web</b>. Executar como: <i>Eu</i>. Quem pode acessar: <i>Qualquer pessoa</i>. Autorize.</li>
          <li>Recarregue a planilha → menu <b>Encontro com Deus → Conectar celulares</b> → envie o link para a equipe.</li>
        </ol>
        <div class="linha-botoes"><button class="btn" data-acao="copiarScript">Copiar código</button>
          <a class="btn" href="apps-script/Codigo.gs" target="_blank" rel="noopener">Ver arquivo</a></div>
      </details>
    </div>

    <div class="cartao linha-botoes">
      ${cfg.demo ? '<button class="btn" data-acao="resetarDemo">Recriar dados fictícios</button>' : '<button class="btn" data-acao="ativarDemo">Modo demonstração</button>'}
      ${configurado() ? '<button class="btn perigo" data-acao="desconectar">Desconectar este aparelho</button>' : ''}
      <span class="muted peq" style="margin-left:auto">v${VERSAO}</span>
    </div>`;
}

async function salvarAvancado(f) {
  for (const k of ['url', 'chave', 'planilha', 'aba', 'evento', 'valorPadrao', 'metodosRecepcao']) cfg[k] = f[k].value.trim();
  cfg.demo = false;
  cfg.mapa = {};
  salvarCfg();
  st.base = null;
  localStorage.removeItem(K.cache);
  await recarregar();
  if (st.base) toast(`Conectado: ${st.planilha} (${st.pessoas.length} registros)`, 'ok');
}

async function conectarComLink(texto) {
  const m = String(texto || '').match(/#conectar=([A-Za-z0-9_-]+)/) || String(texto || '').match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) { toast('Link de conexão inválido.', 'erro'); return; }
  let d;
  try { d = b64url.dec(m[1]); } catch { toast('Link de conexão inválido.', 'erro'); return; }
  if (!d.u || !d.k) { toast('Link de conexão incompleto.', 'erro'); return; }
  const r = await folha({
    titulo: 'Conectar aparelho',
    corpo: `<p>Conectar este aparelho à planilha <b>${esc(d.n || 'do Encontro')}</b>?</p>
      <div class="form"><label class="campo">Nome deste aparelho / atendente<input name="atendente" value="${esc(cfg.atendente)}" placeholder="Ex.: Mesa 1 — Ana"></label></div>
      <p class="muted peq">Os dados ficam guardados neste aparelho para funcionar mesmo com internet ruim. Use "Desconectar" em Ajustes ao terminar.</p>`,
    botoes: [{ v: 'ok', t: 'Conectar', cls: 'primario' }],
    ler: (f) => ({ atendente: f.atendente.value.trim() }),
  });
  history.replaceState(null, '', location.pathname + '#recepcao');
  if (!r) { renderizar(); return; }
  Object.assign(cfg, { url: d.u, chave: d.k, planilha: d.p || '', aba: d.a || '', nomePlanilha: d.n || '', demo: false, mapa: {}, atendente: r.dados.atendente });
  salvarCfg();
  st.base = null; st.fila = []; salvarFila(); localStorage.removeItem(K.cache);
  await recarregar();
  if (st.base) { comemorar('Aparelho conectado!'); irPara('recepcao'); }
}

async function desconectar() {
  const pend = st.fila.length;
  if (!await confirmar('Desconectar aparelho',
    `<p>Remove a conexão e os dados guardados neste aparelho. A planilha não é alterada.</p>${pend ? `<div class="aviso erro"><b>${pend} ação(ões) ainda não foram enviadas</b> e serão perdidas.</div>` : ''}`,
    'Desconectar')) return;
  [K.cfg, K.cache, K.fila].forEach((k) => localStorage.removeItem(k));
  cfg = { ...PADRAO };
  Object.assign(st, { cab: [], linhas: [], abas: [], pessoas: [], base: null, fila: [], planilha: '', aba: '', erro: null, carregadoEm: null });
  renderizar();
  toast('Aparelho desconectado.');
}

/* ================= folha (bottom sheet / janela) ================= */
function folha({ titulo: t, corpo, botoes = [], ler: lerForm, validar }) {
  const dlg = $('#folha');
  const form = $('#folhaForm');
  if (dlg.open) dlg.close('cancelar');
  $('#folhaTitulo').textContent = t;
  $('#folhaCorpo').innerHTML = corpo;
  $('#folhaCorpo').scrollTop = 0;
  $('#folhaBotoes').innerHTML = botoes.length
    ? (botoes.length === 1 ? `<button class="btn" value="cancelar">Cancelar</button>` : '') + botoes.map((b) => `<button class="btn ${b.cls || ''}" value="${b.v}">${esc(b.t)}</button>`).join('')
    : '';
  return new Promise((resolve) => {
    let dados = null;
    const aoEnviar = (e) => {
      const v = e.submitter ? e.submitter.value : 'cancelar';
      if (v !== 'cancelar' && lerForm && botoes.some((b) => b.v === v)) {
        dados = lerForm(form);
        const erro = validar && validar(dados);
        if (erro) { e.preventDefault(); toast(erro, 'erro'); vibrar(80); return; }
      }
      dlg.returnValue = v;
    };
    form.addEventListener('submit', aoEnviar);
    dlg.addEventListener('close', function fim() {
      dlg.removeEventListener('close', fim);
      form.removeEventListener('submit', aoEnviar);
      const v = dlg.returnValue || 'cancelar';
      resolve(v === 'cancelar' ? null : (lerForm && dados ? { v, dados } : v));
    });
    dlg.returnValue = '';
    dlg.showModal();
    if (matchMedia('(min-width: 900px)').matches) {
      const foco = $('#folhaCorpo input:not([type=checkbox]):not([type=radio])');
      if (foco) foco.focus();
    } else {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
    }
  });
}
// fecha no X, tocando fora ou arrastando para baixo; Enter confirma o botão principal
$('#fecharFolha').addEventListener('click', () => $('#folha').close('cancelar'));
$('#folha').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close('cancelar'); });
$('#folha').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox' || e.target.type === 'radio') return;
  e.preventDefault();
  const b = $('#folhaBotoes .btn:last-child');
  if (b && b.value !== 'cancelar') b.click(); else e.target.blur();
});
(() => {
  let y0 = null;
  const dlg = $('#folha');
  dlg.addEventListener('touchstart', (e) => { if (e.target.closest('.folha-alca, .folha-topo')) y0 = e.touches[0].clientY; }, { passive: true });
  dlg.addEventListener('touchmove', (e) => { if (y0 != null) { const d = Math.max(0, e.touches[0].clientY - y0); dlg.style.transform = `translateY(${d}px)`; } }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const d = e.changedTouches[0].clientY - y0;
    y0 = null; dlg.style.transform = '';
    if (d > 90) dlg.close('cancelar');
  });
})();

/* ================= avisos ================= */
function toast(msg, tipo = '', acao = null) {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.innerHTML = `<span class="t-msg"></span>${acao ? `<button>${esc(acao.rotulo)}</button>` : ''}`;
  t.querySelector('.t-msg').textContent = msg;
  if (acao) t.querySelector('button').onclick = () => { t.remove(); acao.fn(); };
  const box = $('#toasts');
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), acao ? 6000 : tipo === 'erro' ? 6000 : 2800);
}
function girar(on) { $$('[data-acao="recarregar"]').forEach((b) => b.classList.toggle('girando', on)); }

function atualizarStatus() {
  const s = $('#statusSync');
  s.className = 'sync';
  $('#faixaOffline').hidden = !(st.offline && configurado() && !cfg.demo);
  if (!configurado()) { s.textContent = 'não conectado'; return; }
  if (cfg.demo) { s.textContent = 'demonstração'; s.classList.add('ok'); return; }
  if (st.offline) { s.classList.add('offline'); s.textContent = st.fila.length ? `sem internet · ${st.fila.length} a enviar` : 'sem internet'; return; }
  if (st.fila.length) { s.classList.add('pendente'); s.textContent = `enviando ${st.fila.length}…`; return; }
  if (st.erro) { s.classList.add('offline'); s.textContent = 'erro na planilha'; return; }
  s.classList.add('ok');
  s.textContent = st.carregadoEm ? `sincronizado ${hora(st.carregadoEm)}` : 'conectando…';
}

/* ================= navegação ================= */
const TELAS = ['painel', 'recepcao', 'ajustes'];
function telaAtual() {
  const h = location.hash.slice(1);
  if (h === 'naopagos') return 'recepcao';
  if (h === 'config') return 'ajustes';
  return TELAS.includes(h) ? h : (configurado() ? 'recepcao' : 'ajustes');
}
const irPara = (t) => { if (location.hash !== '#' + t) location.hash = '#' + t; else renderizar(); };

function renderizar() {
  const t = telaAtual();
  const h = location.hash.slice(1);
  TELAS.forEach((x) => { $('#tela-' + x).hidden = x !== t; });
  $$('[data-tela]').forEach((a) => a.classList.toggle('ativa', a.dataset.tela === (h === 'naopagos' ? 'naopagos' : t) || (h === 'naopagos' && a.closest('.nav-topo') && a.dataset.tela === 'recepcao')));
  $('#faixaDemo').hidden = !cfg.demo;
  $('#tituloEvento').textContent = cfg.evento || 'Encontro com Deus';
  atualizarStatus();
  if (t === 'painel') renderPainel();
  if (t === 'recepcao') renderRecepcao();
  if (t === 'ajustes') renderAjustes();
}
// Re-render sem atrapalhar quem está digitando ou com a folha aberta
function renderizarSoft() {
  const t = telaAtual();
  if (t === 'ajustes' && $('#tela-ajustes').contains(document.activeElement)) { atualizarStatus(); return; }
  renderizar();
}

window.addEventListener('hashchange', (e) => {
  const h = location.hash;
  if (h.startsWith('#conectar=')) { conectarComLink(h); return; }
  if (h === '#naopagos') st.filtro = 'naopagos';
  else if (String(e.oldURL).endsWith('#naopagos') && st.filtro === 'naopagos') st.filtro = 'todos';
  st.limite = 80;
  renderizar();
  window.scrollTo(0, 0);
});

/* ================= eventos ================= */
document.addEventListener('click', async (e) => {
  const alvo = e.target.closest('[data-checkin], [data-ficha], [data-filtro], [data-ir-filtro], [data-painel-grupo], [data-painel-cat], [data-acao]');
  if (!alvo || alvo.closest('#folha')) return;
  const d = alvo.dataset;
  if (d.checkin) { e.stopPropagation(); const p = acharPessoa(d.checkin); if (p) fazerCheckin(p); return; }
  if (d.ficha) { const p = acharPessoa(d.ficha); if (p) abrirFicha(p); return; }
  if (d.filtro) { st.filtro = d.filtro; st.limite = 80; if (location.hash === '#naopagos') history.replaceState(null, '', '#recepcao'); renderizar(); return; }
  if (d.irFiltro) { st.filtro = d.irFiltro; st.busca = ''; $('#busca').value = ''; irPara('recepcao'); return; }
  if (d.painelGrupo) { st.painelGrupo = d.painelGrupo; renderPainel(); return; }
  if (d.painelCat) { st.painelCat = d.painelCat; renderPainel(); return; }
  switch (d.acao) {
    case 'recarregar': await recarregar(); if (!st.erro && !st.offline) toast('Dados atualizados.'); break;
    case 'sincronizar': if (st.fila.length) enviarFila(); else recarregar(); break;
    case 'novoCadastro': novoCadastro(d.nome || (telaAtual() === 'recepcao' && !filtrar().length ? st.busca : '')); break;
    case 'maisResultados': st.limite += 120; renderRecepcao(); break;
    case 'usarLink': conectarComLink($('#colarLink').value); break;
    case 'compartilhar': {
      const link = linkConexao();
      const texto = `Acesso à recepção do ${cfg.evento || 'Encontro com Deus'} (abra no celular):`;
      if (navigator.share) { try { await navigator.share({ title: 'Conectar à recepção', text: texto, url: link }); } catch { /* cancelado */ } }
      else { try { await navigator.clipboard.writeText(link); toast('Link copiado. Envie só para a equipe da recepção.', 'ok'); } catch { prompt('Copie o link:', link); } }
      break;
    }
    case 'instalar': if (st.instalar) { st.instalar.prompt(); await st.instalar.userChoice; st.instalar = null; renderAjustes(); } break;
    case 'salvarMapa':
      cfg.mapa = {};
      $$('.mapa select').forEach((s) => { if (s.value) cfg.mapa[s.dataset.campo] = s.value; });
      salvarCfg(); reconstruir(); toast('Colunas salvas.', 'ok'); renderizar(); break;
    case 'prepararColunas': enfileirar('garantirColunas', { colunas: Object.values(SIS) }); toast('Criando colunas de controle na planilha…'); break;
    case 'copiarScript':
      try { const r = await fetch('apps-script/Codigo.gs', { cache: 'no-cache' }); await navigator.clipboard.writeText(await r.text()); toast('Código copiado. Cole no Apps Script.', 'ok'); }
      catch { toast('Não consegui copiar. Use "Ver arquivo".', 'erro'); }
      break;
    case 'ativarDemo': cfg.demo = true; salvarCfg(); st.base = null; await recarregar(); irPara('painel'); toast('Modo demonstração: dados fictícios.'); break;
    case 'resetarDemo': localStorage.removeItem(K.demo); await recarregar(); toast('Dados fictícios recriados.', 'ok'); break;
    case 'desconectar': desconectar(); break;
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'formAvancado') { e.preventDefault(); salvarAvancado(e.target); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'cfgAtendente') { cfg.atendente = e.target.value.trim(); salvarCfg(); toast('Nome do aparelho salvo.', 'ok'); }
});

const busca = $('#busca');
let tBusca;
busca.addEventListener('input', () => {
  $('#limparBusca').hidden = !busca.value;
  clearTimeout(tBusca);
  tBusca = setTimeout(() => { st.busca = busca.value; st.limite = 80; renderRecepcao(); window.scrollTo(0, 0); }, 100);
});
busca.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  st.busca = busca.value;
  const l = filtrar();
  if (l.length === 1) { busca.blur(); l[0].checkin ? abrirFicha(l[0]) : fazerCheckin(l[0]); }
  else busca.blur();
});
$('#limparBusca').addEventListener('click', () => { busca.value = ''; st.busca = ''; $('#limparBusca').hidden = true; renderRecepcao(); busca.focus(); });

window.addEventListener('online', () => { st.offline = false; enviarFila(); recarregar({ silencioso: true }); });
window.addEventListener('offline', () => { st.offline = true; atualizarStatus(); });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); st.instalar = e; if (telaAtual() === 'ajustes') renderAjustes(); });

/* Atualização automática (outras mesas, novas compras no app) */
setInterval(() => {
  if (document.hidden || $('#folha').open || !configurado()) return;
  if (telaAtual() === 'ajustes') return;
  recarregar({ silencioso: true });
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && configurado() && (!st.carregadoEm || Date.now() - st.carregadoEm > 15000)) recarregar({ silencioso: true });
});

/* ================= modo demonstração ================= */
const Demo = {
  carregar() {
    const d = ler(K.demo, null);
    if (d && d.cab) return d;
    const n = Demo.gerar();
    gravarLS(K.demo, n);
    return n;
  },
  gerar() {
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const nomes = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Elaine', 'Fábio', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karen', 'Lucas', 'Mariana', 'Nelson', 'Olívia', 'Paulo', 'Rafaela', 'Samuel', 'Tatiane', 'Vinícius', 'Yasmin', 'Rodrigo', 'Letícia', 'Mateus'];
    const sobren = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Ferreira', 'Ribeiro'];
    const lideres = ['Marcos Teixeira', 'marcos teixeira ', 'Priscila Rocha', 'Renato Dias', 'Renato dias', 'Simone Prado', 'Tiago Mendes'];
    const discs = ['Pr. Eduardo Moura', 'Eduardo Moura', 'Cláudia Reis', 'claudia reis', 'Roberto Faria'];
    const cab = ['Usado', 'Código', 'Comprador', 'E-mail do comprador', 'Celular do comprador', 'Tipo', 'Data da Compra', 'Status', 'Método de pagamento', 'Preço do Ingresso',
      'Nome Completo', 'Data de Nascimento', 'Sexo', 'Celular', 'Qual o nome do seu discipulador?', 'Qual é o nome do(a) líder de sua célula?',
      'Já foi batizado numa igreja evangélica?', 'Essa é a sua primeira vez no Encontro com Deus?', 'Você faz uso de algum medicamento contínuo? Se sim, qual?',
      'Tem alguma alergia? Se sim, qual?', 'Possui alguma restrição alimentar? Se sim, qual', 'Contato de emergência (Nome e Telefone)'];
    const linhas = [];
    for (let i = 0; i < 42; i++) {
      const nome = `${pick(nomes)} ${pick(sobren)} ${pick(sobren)}`;
      const tipo = i < 20 ? 'Encontrista | LOTE 1' : i < 37 ? 'Equipe | LOTE 1' : 'Anjo | LOTE 1';
      const r = rnd();
      const status = r < 0.12 ? 'Pendente' : 'Pago';
      const metodo = status === 'Pendente' ? 'PIX' : r < 0.7 ? 'PIX' : r < 0.93 ? 'Cartão de crédito' : 'Externo (Manual)';
      const cel = `+55659${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}`;
      linhas.push(['Não Usado', Math.floor(rnd() * 0xfffff).toString(16).padStart(5, '0'), nome, 'exemplo' + i + '@exemplo.com', cel, tipo,
        `0${1 + (i % 5)}/06/2026 1${i % 10}:${String(i % 60).padStart(2, '0')}`, status, metodo, metodo.startsWith('Externo') ? '' : '145',
        nome, `${String(1 + (i % 28)).padStart(2, '0')}/0${1 + (i % 9)}/19${70 + (i % 30)}`, rnd() < 0.5 ? 'Masculino' : 'Feminino', cel,
        pick(discs), pick(lideres),
        rnd() < 0.65 ? 'Sim, ja fui batizado em uma igreja evangélica' : 'Não sou batizado em igreja evangélica',
        i < 20 ? 'Sim, é minha primeira vez' : 'Não, eu ja fui em outro encontro',
        rnd() < 0.85 ? 'Não' : 'Losartana', rnd() < 0.85 ? 'Não' : 'Dipirona', rnd() < 0.9 ? 'Não' : 'Lactose', 'Contato Exemplo 65 90000-0000']);
    }
    return { planilha: 'Demonstração (dados fictícios)', aba: 'Ingressos', cab, linhas };
  },
  garantir(d, cols) { for (const c of cols) if (c && !d.cab.includes(c)) { d.cab.push(c); d.linhas.forEach((l) => l.push('')); } },
  async api(acao, p) {
    await new Promise((r) => setTimeout(r, 120));
    const d = Demo.carregar();
    if (acao === 'ler') return { ok: true, planilha: d.planilha, aba: d.aba, abas: [d.aba], cabecalho: [...d.cab], linhas: d.linhas.map((l) => [...l]) };
    if (acao === 'garantirColunas') { Demo.garantir(d, p.colunas); gravarLS(K.demo, d); return { ok: true }; }
    const v = p.valores || {};
    Demo.garantir(d, Object.keys(v));
    if (acao === 'atualizar') {
      let li = p.linha - 2;
      const ci = d.cab.indexOf(p.chaveColuna);
      if (ci >= 0 && p.chaveValor && (!d.linhas[li] || d.linhas[li][ci] !== p.chaveValor)) li = d.linhas.findIndex((l) => l[ci] === p.chaveValor);
      if (li < 0 || !d.linhas[li]) throw new Error('Registro não encontrado.');
      for (const [k, val] of Object.entries(v)) d.linhas[li][d.cab.indexOf(k)] = String(val ?? '');
    } else if (acao === 'inserir') {
      const ci = d.cab.indexOf(p.chaveColuna);
      if (!(ci >= 0 && d.linhas.some((l) => l[ci] === v[p.chaveColuna]))) d.linhas.push(d.cab.map((h) => String(v[h] ?? '')));
    } else throw new Error('Ação desconhecida: ' + acao);
    gravarLS(K.demo, d);
    return { ok: true };
  },
};

/* ================= início ================= */
(function iniciar() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sem SW: funciona igual, só não abre offline */ });
  }
  if (location.hash === '#naopagos') st.filtro = 'naopagos';
  // Abre na hora com os dados guardados no aparelho; depois atualiza pela internet.
  const cache = ler(K.cache, null);
  if (configurado() && !cfg.demo && cache && cache.url === cfg.url && cache.cabecalho) {
    usarBase(cache);
    st.carregadoEm = cache.em ? new Date(cache.em) : null;
  }
  renderizar();
  if (location.hash.startsWith('#conectar=')) { conectarComLink(location.hash); return; }
  if (configurado()) recarregar({ silencioso: !!st.base });
  console.info('Encontro com Deus v' + VERSAO);
})();
