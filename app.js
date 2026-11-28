/* Encontro com Deus — Painel e Recepção  v3
 * App estático (GitHub Pages). Banco = Firebase/Firestore (ao vivo, offline). Também abre .xlsx/.csv e o antigo modo Google (Apps Script).
 * Ações gravam primeiro no aparelho (resposta instantânea) e vão para a planilha por uma fila,
 * que aguenta internet ruim: se cair, as ações esperam e são reenviadas sozinhas.
 */
'use strict';

const VERSAO = '3.2.0';
const K = { cfg: 'encontro.cfg.v1', demo: 'encontro.demo.v1', fila: 'encontro.fila.v1', cache: 'encontro.cache.v1', local: 'encontro.local.v1' };
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
  valorPadrao: '145', metodosRecepcao: 'Externo, Manual, Dinheiro', mapa: {}, demo: false, local: false, ev: '', nomePlanilha: '',
};
let cfg = { ...PADRAO, ...ler(K.cfg, {}) };
const salvarCfg = () => gravarLS(K.cfg, cfg);
const configurado = () => cfg.demo || cfg.local || !!cfg.ev || !!(cfg.url && cfg.chave);
const semNuvem = () => cfg.demo || cfg.local; // dados só no aparelho

const CAMPOS = [
  { k: 'codigo', nome: 'Código', re: /^(codigo|ingresso|codigo do ingresso|id do ingresso)$/ },
  { k: 'usado', nome: 'Usado', re: /^usado$/ },
  { k: 'nome', nome: 'Nome Completo', re: /^(nome completo|nome|participante|nome do participante|nome completo do participante|inscrito|nome do inscrito|encontrista)$/ },
  { k: 'comprador', nome: 'Comprador', re: /^comprador$/ },
  { k: 'tipo', nome: 'Tipo', re: /^(tipo|lote|categoria|tipo de ingresso)$/ },
  { k: 'status', nome: 'Status', re: /^(status|situacao|status do pagamento|situacao do pagamento)$/ },
  { k: 'metodo', nome: 'Método de pagamento', re: /metodo de pagamento|forma de pagamento|^pagamento$/ },
  { k: 'preco', nome: 'Preço do Ingresso', re: /preco|valor do ingresso/ },
  { k: 'dataCompra', nome: 'Data da Compra', re: /data da compra/ },
  { k: 'celular', nome: 'Celular', re: /^(celular|telefone|whatsapp|contato celular|celular do participante|telefone do participante)$/ },
  { k: 'celularComprador', nome: 'Celular do comprador', re: /celular do comprador/ },
  { k: 'emailComprador', nome: 'E-mail do comprador', re: /e ?mail/ },
  { k: 'igreja', nome: 'Igreja do comprador', re: /igreja do comprador|^qual igreja$|^igreja$/ },
  { k: 'nascimento', nome: 'Data de Nascimento', re: /nascimento/ },
  { k: 'sexo', nome: 'Sexo', re: /^sexo$/ },
  { k: 'discipulador', nome: 'Qual o nome do seu discipulador?', re: /discipulador/ },
  { k: 'lider', nome: 'Qual é o nome do(a) líder de sua célula?', re: /lider/ },
  { k: 'locomocao', nome: 'Meio de locomoção', re: /locomocao|transporte/ },
  { k: 'batizado', nome: 'Já foi batizado numa igreja evangélica?', re: /batizad/ },
  { k: 'primeiraVez', nome: 'Primeira vez no Encontro?', re: /primeira vez/ },
  { k: 'medicamento', nome: 'Medicamento contínuo', re: /medicamento/ },
  { k: 'alergia', nome: 'Alergia', re: /alergia/ },
  { k: 'restricao', nome: 'Restrição alimentar', re: /restricao/ },
  { k: 'emergencia', nome: 'Contato de emergência', re: /emergencia/ },
  { k: 'obsArq', nome: 'Observação (da planilha)', re: /^(observacao|observacoes|obs)$/ },
];
const SIS = {
  checkin: 'Check-in', checkinEm: 'Check-in em', checkinPor: 'Check-in por',
  pagoRec: 'Pago na recepção', valorRec: 'Valor recepção', pagoRecEm: 'Pago na recepção em',
  cadastroPor: 'Cadastrado na recepção por',
  quarto: 'Quarto',
  obs: 'Observação (recepção)',
};

/* Quartos: aba própria na planilha (criada automaticamente com o mapa abaixo) */
const ABA_Q = 'Quartos';
const CAB_Q = ['Quarto', 'Andar', 'Ala', 'Camas', 'Sexo', 'Observação'];
const QUARTOS_PADRAO = [
  ...[[1, 12], [2, 14], [3, 14], [4, 14], [5, 14], [6, 14]].map(([n, c]) => [`Quarto ${String(n).padStart(2, '0')}`, 'Cima', 'Parte 1 (interno)', c, 'Feminino', `${c / 2} beliches`]),
  ...[[7, 12], [8, 16], [9, 14]].map(([n, c]) => [`Quarto ${String(n).padStart(2, '0')}`, 'Cima', 'Corredor de fora', c, '', `${c / 2} beliches`]),
  ...[[10, 14], [11, 14], [12, 14]].map(([n, c]) => [`Quarto ${n}`, 'Cima', 'Corredores do fundo', c, 'Masculino', `${c / 2} beliches`]),
  ...[[13, 8], [14, 8], [15, 10], [16, 8], [17, 10], [18, 13]].map(([n, c]) => [`Quarto ${n}`, 'Baixo', 'Lado direito', c, 'Masculino', n === 18 ? '6 beliches + 1 cama' : `${c / 2} beliches`]),
  ...[[19, 8], [20, 10], [21, 8], [22, 10], [23, 10], [24, 12]].map(([n, c]) => [`Quarto ${n}`, 'Baixo', 'Lado esquerdo', c, 'Feminino', `${c / 2} beliches`]),
  ['Colchões masculinos', 'Extras', 'Colchões', 25, 'Masculino', 'Colchões avulsos'],
  ['Colchões femininos', 'Extras', 'Colchões', 24, 'Feminino', 'Colchões avulsos'],
  ['Cozinha', 'Extras', 'Cozinha', 6, '', 'Equipe da cozinha (fora da distribuição automática)'],
];
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
  q: { cab: [], linhas: [], existe: false }, criandoQuartos: false,
};

/* ================= acesso à planilha ================= */
class ErroRede extends Error {}

async function api(acao, dados = {}) {
  if (cfg.ev && !semNuvem()) return Nuvem.api(acao, dados);
  if (semNuvem()) return Demo.api(acao, dados);
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
  // Planilhas sem "Status": o pagamento vem da forma de pagamento ("Não pago", "Pendente" = não pagou).
  const pagoMetodo = !ns && !!norm(metodo) && !/^(nao pago|pendente|aguardando|em aberto|aberto|nao)( |$)/.test(norm(metodo));
  const pago = !cancelado && (pagoStatus || pagoMetodo || !!metodoRec);
  const pagoRec = pago && (!!metodoRec || metodoEhRecepcao(metodo));
  const nb = norm(g('batizado'));
  const p = {
    linha: i + 2, codigo, nome, cat, tipo, status, metodo, cancelado, pago, pagoRec, pagoApp: pago && !pagoRec,
    batizado: /^(sim|1|1 0|true|verdadeiro)( |$)/.test(nb) ? 'sim' : /^(nao|0|0 0|false|falso)( |$)/.test(nb) ? 'nao' : '',
    checkin: /^(sim|realizado|confirmado|feito|presente|ok)( |$)/.test(norm(g('sis_checkin'))) || norm(g('usado')) === 'usado',
    checkinEm: g('sis_checkinEm'), checkinPor: g('sis_checkinPor'),
    metodoRec, valorRec: g('sis_valorRec'), pagoRecEm: g('sis_pagoRecEm'), cadastroPor: g('sis_cadastroPor'),
    preco: g('preco'), celular: g('celular') || g('celularComprador'), comprador: titulo(g('comprador')),
    lider: g('lider'), discipulador: g('discipulador'), sexo: g('sexo'), nascimento: g('nascimento'),
    medicamento: g('medicamento'), alergia: g('alergia'), restricao: g('restricao'), emergencia: g('emergencia'),
    locomocao: g('locomocao'), primeiraVez: g('primeiraVez'), igreja: g('igreja'),
    quarto: g('sis_quarto'), obs: g('sis_obs'), obsArq: g('obsArq'),
  };
  const nsx = norm(p.sexo);
  p.sx = nsx.startsWith('f') ? 'f' : nsx.startsWith('m') ? 'm' : '';
  p.saude = [p.medicamento, p.alergia, p.restricao].some((v) => !negativo(v));
  p.busca = norm([nome, p.comprador, codigo, p.lider, p.discipulador, p.quarto, rotuloQuarto(p.quarto), p.obs, p.obsArq].join(' ')) + ' ' + celNacional(p.celular) + ' ' + celNacional(g('celularComprador'));
  return p;
}

function reconstruir() {
  st.idx = mapear(st.cab);
  st.pessoas = st.linhas.map(montarPessoa).filter(Boolean);
}

/* --- operações locais (otimistas) --- */
function garantirEm(cab, linhas, cols) {
  for (const c of cols) if (c && !cab.includes(c)) { cab.push(c); linhas.forEach((l) => l.push('')); }
}
function atualizarEm(cab, linhas, it) {
  const v = it.valores || {};
  garantirEm(cab, linhas, Object.keys(v));
  let li = it.linha - 2;
  const ci = cab.indexOf(it.chaveColuna);
  if (ci >= 0 && it.chaveValor && String(linhas[li]?.[ci] ?? '').trim() !== it.chaveValor) {
    li = linhas.findIndex((l) => String(l[ci] ?? '').trim() === it.chaveValor);
  }
  if (li < 0 || !linhas[li]) return;
  for (const [k, val] of Object.entries(v)) linhas[li][cab.indexOf(k)] = String(val ?? '');
}
function aplicarLocal(op) {
  const d = op.dados;
  if (op.acao === 'garantirAba') {
    if (d.nome === ABA_Q && !st.q.existe) st.q = { cab: [...d.cabecalho], linhas: d.linhas.map((l) => l.map(String)), existe: true };
    return;
  }
  const t = d.aba === ABA_Q ? st.q : st;
  if (op.acao === 'atualizar') atualizarEm(t.cab, t.linhas, d);
  else if (op.acao === 'atualizarVarios') d.itens.forEach((it) => atualizarEm(t.cab, t.linhas, { chaveColuna: d.chaveColuna, ...it }));
  else if (op.acao === 'inserir') {
    const v = d.valores || {};
    garantirEm(t.cab, t.linhas, Object.keys(v));
    const ci = t.cab.indexOf(d.chaveColuna);
    if (ci >= 0 && t.linhas.some((l) => l[ci] === v[d.chaveColuna])) return;
    t.linhas.push(t.cab.map((h) => String(v[h] ?? '')));
  } else if (op.acao === 'garantirColunas') garantirEm(t.cab, t.linhas, d.colunas || []);
}

function salvarCache() {
  if (semNuvem() || !st.base) return;
  gravarLS(K.cache, { ...st.base, em: st.carregadoEm && st.carregadoEm.toISOString(), url: cfg.ev || cfg.url });
}

function usarBase(b) {
  st.base = b;
  st.cab = [...b.cabecalho];
  st.linhas = b.linhas.map((l) => [...l]);
  st.abas = b.abas || [];
  st.planilha = b.planilha || '';
  st.aba = b.aba || '';
  st.q = b.quartos && b.quartos.cabecalho && b.quartos.cabecalho.length
    ? { cab: [...b.quartos.cabecalho], linhas: b.quartos.linhas.map((l) => [...l]), existe: true }
    : { cab: [...CAB_Q], linhas: QUARTOS_PADRAO.map((l) => l.map(String)), existe: false };
  for (const op of st.fila) aplicarLocal(op);
  reconstruir();
}

// Na primeira vez, cria a aba "Quartos" na planilha com o mapa padrão.
function garantirAbaQuartos() {
  if (st.q.existe || st.criandoQuartos || !st.base) return;
  if (st.fila.some((op) => op.acao === 'garantirAba')) return;
  st.criandoQuartos = true;
  enfileirar('garantirAba', { nome: ABA_Q, cabecalho: CAB_Q, linhas: QUARTOS_PADRAO.map((l) => l.map(String)) });
}

async function recarregar({ silencioso = false } = {}) {
  if (!configurado()) return;
  if (st.fila.length) await enviarFila();
  if (st.fila.length && st.offline) { atualizarStatus(); return; }
  girar(true);
  try {
    const r = await api('ler', { extras: [ABA_Q] });
    st.carregadoEm = new Date();
    st.erro = null;
    st.offline = false;
    usarBase({ cabecalho: r.cabecalho || [], linhas: r.linhas || [], abas: r.abas, planilha: r.planilha, aba: r.aba, quartos: (r.outras || {})[ABA_Q] || null });
    if (st.q.existe) st.criandoQuartos = false;
    else garantirAbaQuartos();
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
      comemorar(`${primeiroNome(p)} pagou e entrou!${textoQuarto(p)}`);
      toast(`Pagamento (${r.dados.metodo}) + check-in de ${p.nome}`, 'ok', desfazerCom(p, { pag: true, chk: true }));
      return;
    }
  }
  atualizar(p, valoresCheckin(true));
  comemorar(`Bem-vind${p.sx === 'f' ? 'a' : p.sx === 'm' ? 'o' : 'o(a)'}, ${primeiroNome(p)}!${textoQuarto(p)}`);
  toast(`Check-in de ${p.nome}${p.quarto ? ' · ' + p.quarto : ''}`, 'ok', desfazerCom(p, { chk: true }));
  limparBuscaAposAcao();
}
const primeiroNome = (p) => p.nome.split(' ')[0];
const textoQuarto = (p) => (p.quarto ? `\n${p.quarto}` : '\nSem quarto ainda');

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
    ['Quarto', p.quarto || 'Sem quarto', !p.quarto && !p.cancelado],
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
        ${p.cancelado ? '' : `<button class="btn larga" value="quarto">${p.quarto ? `Quarto: ${esc(p.quarto)} · trocar` : 'Escolher quarto'}</button>`}
        ${p.celular ? `<a class="btn" href="tel:+55${celNacional(p.celular)}">Ligar</a>` : ''}
        ${wa ? `<a class="btn" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </div>
      <div class="obs-ficha">
        <div class="obs-topo"><b>Observação</b><button class="btn peq" value="obs">${p.obs ? 'Editar' : '+ Adicionar'}</button></div>
        ${p.obsArq ? `<div class="obs-txt"><span class="muted peq">Da inscrição:</span> ${esc(p.obsArq)}</div>` : ''}
        ${p.obs ? `<div class="obs-txt">${esc(p.obs)}</div>` : p.obsArq ? '' : '<div class="muted peq">Ex.: pagamentos parciais, recados.</div>'}
      </div>
      <div class="dados">${linhas.map(([k, v, dest]) => `<div class="${dest ? 'destaque' : ''}"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>
      ${p.metodoRec ? `<button class="btn perigo peq" value="estornar">Desfazer pagamento da recepção</button>` : ''}`,
  });
  if (r === 'checkin') return fazerCheckin(p);
  if (r === 'pagar') return receberPagamento(p);
  if (r === 'quarto') return escolherQuarto(p);
  if (r === 'obs') return editarObs(p);
  if (r === 'descheckin' && await confirmar('Desfazer check-in', `<p>Remover a presença de <b>${esc(p.nome)}</b>?</p>`, 'Desfazer check-in')) {
    atualizar(p, valoresCheckin(false)); toast('Check-in desfeito.');
  }
  if (r === 'estornar' && await confirmar('Desfazer pagamento', `<p>Remover o pagamento registrado na recepção para <b>${esc(p.nome)}</b>?</p>`, 'Desfazer pagamento')) {
    atualizar(p, valoresSemPagamento()); toast('Pagamento desfeito.');
  }
}

async function editarObs(p) {
  const r = await folha({
    titulo: 'Observação',
    corpo: `${cabecalhoPessoa(p)}<div class="form">
      <label class="campo">Observação<textarea name="obs" rows="5" placeholder="Ex.: 10/12 pagou R$ 50 no PIX · falta R$ 95">${esc(p.obs)}</textarea></label>
      <button type="button" class="btn peq" id="obsHoje">+ Linha com a data de hoje</button>
    </div>`,
    botoes: [{ v: 'ok', t: 'Salvar', cls: 'primario' }],
    ler: (f) => ({ obs: f.obs.value.trim() }),
  });
  if (r && r.dados.obs !== p.obs) { atualizar(p, { [SIS.obs]: r.dados.obs }); toast('Observação salva.', 'ok'); }
  const atual = acharPessoaPorCodigo(p) || p;
  return abrirFicha(atual);
}
document.addEventListener('click', (e) => {
  if (e.target.id !== 'obsHoje') return;
  const t = $('#folhaCorpo textarea[name=obs]');
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  t.value = (t.value.trim() ? t.value.trim() + String.fromCharCode(10) : '') + hoje + ' ';
  t.focus(); t.setSelectionRange(t.value.length, t.value.length);
});

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
      <label class="campo">Quarto (opcional)<select name="quarto"><option value="">Definir depois</option>${(() => {
        const oc = ocupacao();
        return listaQuartos().map((q) => { const l = q.camas - ocupantesDe(q, oc).length; return `<option value="${esc(q.nome)}" ${l <= 0 ? 'disabled' : ''}>${esc(q.nome)} · ${SEXO_TXT[q.sx]} · ${l <= 0 ? 'lotado' : l + ' vaga(s)'}</option>`; }).join('');
      })()}</select></label>
      <div><div class="rotulo-grupo">Pagamento</div>${radios('pagamento', [['', 'Não pagou'], ...METODOS.map((m) => [m, m])], '')}</div>
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${esc(cfg.valorPadrao)}"></label>
      <label class="campo">Observação <span class="muted" style="font-weight:400">(ex.: pagamento parcial)</span><textarea name="obs" rows="3" placeholder="Ex.: pagou R$ 50 no PIX, falta R$ 95"></textarea></label>
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
  if (d.quarto) v[SIS.quarto] = d.quarto;
  if (d.obs) v[SIS.obs] = d.obs;
  if (colNome('comprador')) v[colNome('comprador')] = nome;
  if (colNome('usado')) v[colNome('usado')] = 'Não Usado';
  if (d.pagamento) {
    Object.assign(v, valoresPagamento(d.pagamento, d.valor));
    v[colOuPadrao('metodo')] = `${d.pagamento} (recepção)`;
    v[colOuPadrao('preco')] = d.valor;
  }
  if (d.checkin) Object.assign(v, valoresCheckin(true));
  enfileirar('inserir', { valores: v, chaveColuna: colOuPadrao('codigo') });
  comemorar((d.checkin ? `${nome.split(' ')[0]} cadastrado(a) e presente!` : 'Cadastro feito!') + (d.quarto ? `\n${d.quarto}` : ''));
  toast(`${nome} cadastrado(a)`, 'ok');
  if (telaAtual() !== 'recepcao') irPara('recepcao');
  st.busca = ''; $('#busca').value = ''; $('#limparBusca').hidden = true;
  renderRecepcao();
}

/* ================= quartos ================= */
function rotuloQuarto(nome) {
  if (!nome) return '';
  const m = String(nome).match(/quarto\s*0*(\d+)/i);
  if (m) return 'Q' + m[1].padStart(2, '0');
  return String(nome).length > 12 ? String(nome).split(' ')[0] : String(nome);
}
const SEXO_TXT = { f: 'Feminino', m: 'Masculino', '': 'Misto' };
const colQ = (k) => {
  const alvo = { quarto: 'quarto', andar: 'andar', ala: 'ala', camas: 'camas', sexo: 'sexo', obs: 'observacao' }[k];
  const i = st.q.cab.findIndex((h) => norm(h) === alvo || norm(h).startsWith(alvo));
  return i >= 0 ? st.q.cab[i] : CAB_Q[['quarto', 'andar', 'ala', 'camas', 'sexo', 'obs'].indexOf(k)];
};
function listaQuartos() {
  const ix = (k) => st.q.cab.indexOf(colQ(k));
  const [iq, ia, il, ic, is, io] = ['quarto', 'andar', 'ala', 'camas', 'sexo', 'obs'].map(ix);
  return st.q.linhas.map((l, i) => {
    const nome = String(l[iq] ?? '').trim();
    const sxn = norm(l[is]);
    return {
      nome, linha: i + 2, andar: String(l[ia] ?? '').trim(), ala: String(l[il] ?? '').trim(),
      camas: Math.max(0, Math.round(numero(l[ic]))), sx: sxn.startsWith('f') ? 'f' : sxn.startsWith('m') ? 'm' : '',
      obs: String(l[io] ?? '').trim(), cozinha: /cozinha/.test(norm(nome)),
    };
  }).filter((q) => q.nome);
}
const ativosComQuarto = () => st.pessoas.filter((p) => !p.cancelado && p.quarto);
function ocupacao() {
  const m = new Map();
  for (const p of ativosComQuarto()) {
    const k = norm(p.quarto);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  return m;
}
const ocupantesDe = (q, oc = ocupacao()) => (oc.get(norm(q.nome)) || []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const acharQuarto = (nome) => listaQuartos().find((q) => norm(q.nome) === norm(nome));
const corSexo = (sx) => (sx === 'f' ? '#d6457a' : sx === 'm' ? 'var(--azul)' : 'var(--muted)');
const ehColchao = (q) => /colch|avuls/.test(norm(q.nome));
/* Capela = o "Andar" do quarto (Cima / Baixo). Colchões e Cozinha (Extras) não pertencem a uma capela. */
const nomeCapela = (andar) => (/capela/i.test(andar) ? andar : 'Capela de ' + andar);
const listaCapelas = () => [...new Set(listaQuartos().filter((q) => !q.cozinha && !ehColchao(q) && q.andar).map((q) => q.andar))];

function renderQuartos() {
  const el = $('#tela-quartos');
  if (!configurado()) { el.innerHTML = cartaoConectar(); return; }
  if (!st.base) { el.innerHTML = esqueleto(); return; }
  const qs = listaQuartos();
  const oc = ocupacao();
  const ativos = st.pessoas.filter((p) => !p.cancelado);
  const cap = qs.reduce((s, q) => s + q.camas, 0);
  const alocados = ativosComQuarto().length;
  const sem = ativos.filter((p) => !p.quarto);
  const nomesQ = new Set(qs.map((q) => norm(q.nome)));
  const perdidos = ativosComQuarto().filter((p) => !nomesQ.has(norm(p.quarto)));
  const vagas = (sx) => qs.filter((q) => q.sx === sx && !q.cozinha).reduce((s, q) => s + Math.max(0, q.camas - ocupantesDe(q, oc).length), 0);
  const vagasMisto = vagas('');

  const grupos = [];
  for (const q of qs) {
    const k = q.andar + '|' + q.ala;
    let g = grupos.find((x) => x.k === k);
    if (!g) grupos.push(g = { k, andar: q.andar, ala: q.ala, qs: [] });
    g.qs.push(q);
  }

  el.innerHTML = `
    ${!st.q.existe ? '<div class="aviso">Criando a aba "Quartos" na planilha com o mapa padrão…</div>' : ''}
    ${perdidos.length ? `<div class="aviso erro">${perdidos.length} pessoa(s) estão num quarto que não existe no mapa (${esc([...new Set(perdidos.map((p) => p.quarto))].join(', '))}).</div>` : ''}
    <div class="cartao">
      <div class="hero">
        <div class="anel" style="--p:${pct(alocados, cap)}"><div>${pct(alocados, cap)}%</div></div>
        <div class="hero-txt">
          <div class="muted peq">Camas ocupadas</div>
          <div class="grande">${alocados}<span> de ${cap}</span></div>
          <div class="muted peq">${sem.length} inscrito(s) sem quarto</div>
        </div>
      </div>
      <div class="sexo-resumo">
        <div><b style="color:${corSexo('f')}">Mulheres</b><span>${sem.filter((p) => p.sx === 'f').length} sem quarto</span><span>${vagas('f')} vagas femininas</span></div>
        <div><b style="color:${corSexo('m')}">Homens</b><span>${sem.filter((p) => p.sx === 'm').length} sem quarto</span><span>${vagas('m')} vagas masculinas</span></div>
        <div><b>Mistos/avulsos</b><span>${vagasMisto} vagas</span>${sem.filter((p) => !p.sx).length ? `<span class="txt-erro">${sem.filter((p) => !p.sx).length} sem sexo informado</span>` : ''}</div>
      </div>
      <div class="linha-botoes" style="margin-top:12px">
        <button class="btn primario" data-acao="distribuir">Distribuir automaticamente</button>
        ${sem.length ? `<button class="btn suave" data-ir-filtro="semquarto">Ver sem quarto (${sem.length})</button>` : ''}
      </div>
      ${qs.some((q) => ehColchao(q) && !q.sx) ? `<div class="aviso" style="margin-top:12px">Há colchões sem sexo definido: a distribuição automática não usa esses colchões.
        <div style="margin-top:8px"><button class="btn" data-acao="dividirColchoes">Dividir colchões por sexo</button></div></div>` : ''}
    </div>
    ${grupos.map((g) => {
      const camas = g.qs.reduce((s, q) => s + q.camas, 0);
      const ocup = g.qs.reduce((s, q) => s + ocupantesDe(q, oc).length, 0);
      const sxs = [...new Set(g.qs.map((q) => q.sx))];
      const ehCapela = listaCapelas().includes(g.andar);
      return `<div class="secao">${esc(ehCapela ? nomeCapela(g.andar) : g.andar)}${g.ala ? ' · ' + esc(g.ala) : ''}
          <span class="secao-dir">${sxs.length === 1 ? `<span style="color:${corSexo(sxs[0])}">${SEXO_TXT[sxs[0]]}</span> · ` : ''}${ocup}/${camas}</span></div>
        <div class="quartos-grade">${g.qs.map((q) => {
          const n = ocupantesDe(q, oc).length;
          const livre = q.camas - n;
          return `<button class="quarto ${livre <= 0 ? 'lotado' : ''}" data-quarto="${esc(q.nome)}">
            <span class="q-topo"><b>${esc(q.nome)}</b><i style="background:${corSexo(q.sx)}" title="${SEXO_TXT[q.sx]}"></i></span>
            <span class="q-num">${n}<small>/${q.camas}</small></span>
            <span class="q-barra"><span style="width:${Math.min(100, pct(n, q.camas))}%;background:${livre < 0 ? 'var(--erro)' : corSexo(q.sx)}"></span></span>
            <span class="q-st">${livre < 0 ? `${-livre} acima da capacidade` : livre === 0 ? 'Lotado' : `${livre} vaga${livre > 1 ? 's' : ''}`}</span>
          </button>`;
        }).join('')}</div>`;
    }).join('')}
    <div class="cartao linha-botoes" style="margin-top:20px">
      <button class="btn" data-acao="novoQuarto">+ Novo quarto</button>
      ${alocados ? '<button class="btn perigo" data-acao="limparQuartos">Tirar todos dos quartos</button>' : ''}
    </div>`;
}

const respostaV = (r) => (r == null ? null : typeof r === 'string' ? r : r.v);

async function abrirQuarto(nome) {
  for (;;) {
    const q = acharQuarto(nome);
    if (!q) return;
    const ocs = ocupantesDe(q);
    const livre = q.camas - ocs.length;
    const r = await folha({
      titulo: q.nome,
      corpo: `
        <div class="muted peq">${esc([q.andar, q.ala, SEXO_TXT[q.sx], q.obs].filter(Boolean).join(' · '))}</div>
        <div class="q-cab"><span class="q-num">${ocs.length}<small>/${q.camas}</small></span>
          <span class="${livre < 0 ? 'txt-erro' : 'muted'}">${livre < 0 ? `${-livre} acima da capacidade` : livre === 0 ? 'Lotado' : `${livre} vaga(s)`}</span></div>
        <button class="btn primario bloco" value="add">+ Adicionar pessoas</button>
        <div class="ocupantes">${ocs.length ? ocs.map((p) => `
          <div class="ocupante">
            <button class="oc-nome" value="ficha:${p.linha}"><span class="avatar mini av-${p.cat}">${esc(iniciais(p.nome))}</span>
              <span><b>${esc(p.nome)}</b><small>${esc([CATS[p.cat], p.sx && p.sx !== q.sx && q.sx ? '⚠ ' + SEXO_TXT[p.sx] : '', p.discipulador && 'Disc. ' + titulo(p.discipulador), p.checkin ? '✓ presente' : ''].filter(Boolean).join(' · '))}</small></span></button>
            <button class="icone-btn" value="rem:${p.linha}" aria-label="Tirar do quarto"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
          </div>`).join('') : '<div class="vazio">Quarto vazio.</div>'}</div>
        <details class="avancado"><summary>Editar quarto</summary>
          <div class="form" style="margin-top:10px">
            <div class="duas-col">
              <label class="campo">Camas<input name="qcamas" inputmode="numeric" value="${q.camas}"></label>
              <label class="campo">Sexo<select name="qsexo"><option value="">Misto</option><option ${q.sx === 'f' ? 'selected' : ''}>Feminino</option><option ${q.sx === 'm' ? 'selected' : ''}>Masculino</option></select></label>
            </div>
            <label class="campo">Observação<input name="qobs" value="${esc(q.obs)}"></label>
            <button class="btn" value="salvarq">Salvar quarto</button>
          </div></details>`,
      ler: (f) => ({ camas: f.qcamas.value.trim(), sexo: f.qsexo.value, obs: f.qobs.value.trim() }),
    });
    const v = respostaV(r);
    if (!v) return;
    if (v === 'add') { await adicionarAoQuarto(q); continue; }
    if (v.startsWith('rem:')) {
      const p = acharPessoa(v.slice(4));
      if (p) { atualizar(p, { [SIS.quarto]: '' }); toast(`${p.nome} saiu do ${q.nome}`, '', { rotulo: 'Desfazer', fn: () => atualizar(acharPessoaPorCodigo(p) || p, { [SIS.quarto]: q.nome }) }); }
      continue;
    }
    if (v.startsWith('ficha:')) { const p = acharPessoa(v.slice(6)); if (p) abrirFicha(p); return; }
    if (v === 'salvarq') {
      enfileirar('atualizar', { aba: ABA_Q, linha: q.linha, chaveColuna: colQ('quarto'), chaveValor: q.nome,
        valores: { [colQ('camas')]: String(Math.max(0, Math.round(numero(r.dados.camas)))), [colQ('sexo')]: r.dados.sexo, [colQ('obs')]: r.dados.obs } });
      toast('Quarto atualizado.', 'ok');
      continue;
    }
  }
}

async function adicionarAoQuarto(q) {
  const livre = q.camas - ocupantesDe(q).length;
  const cands = st.pessoas.filter((p) => !p.cancelado && !p.quarto)
    .sort((a, b) => ((q.sx && b.sx === q.sx) - (q.sx && a.sx === q.sx)) || (b.checkin - a.checkin) || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!cands.length) { toast('Todos os inscritos já têm quarto.'); return; }
  const outros = q.sx ? cands.filter((p) => p.sx !== q.sx).length : 0;
  const pr = folha({
    titulo: `Adicionar ao ${q.nome}`,
    corpo: `
      <div class="campo-busca" style="margin-bottom:8px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="selBusca" type="search" placeholder="Buscar nome, líder, discipulador" autocomplete="off"></div>
      ${outros ? `<label class="interruptor" style="margin-bottom:8px">Mostrar ${q.sx === 'f' ? 'homens' : 'mulheres'} e sem sexo informado (${outros})<input type="checkbox" id="selOutros"></label>` : ''}
      <div class="muted peq" id="selInfo" style="margin-bottom:6px"></div>
      <div class="sel-lista">${cands.map((p) => `
        <label class="sel-item" data-busca="${esc(p.busca)}" ${q.sx && p.sx !== q.sx ? 'data-outro hidden' : ''}>
          <input type="checkbox" name="sel" value="${p.linha}">
          <span class="avatar mini av-${p.cat}">${esc(iniciais(p.nome))}</span>
          <span class="sel-txt"><b>${esc(p.nome)}</b><small>${esc([CATS[p.cat], SEXO_TXT[p.sx] !== 'Misto' ? SEXO_TXT[p.sx] : 'sexo não informado', p.discipulador && 'Disc. ' + titulo(p.discipulador), p.lider && 'Líder ' + titulo(p.lider), p.checkin ? '✓ presente' : ''].filter(Boolean).join(' · '))}</small></span>
        </label>`).join('')}</div>`,
    botoes: [{ v: 'ok', t: 'Alocar selecionados', cls: 'primario' }],
    ler: (f) => $$('input[name=sel]:checked', f).map((i) => acharPessoa(i.value)).filter(Boolean),
  });
  const info = $('#selInfo');
  const atualizarInfo = () => {
    const n = $$('#folhaCorpo input[name=sel]:checked').length;
    info.innerHTML = `${n} selecionado(s) · ${livre} vaga(s)${n > livre ? ' · <b class="txt-erro">passa da capacidade</b>' : ''}`;
  };
  const filtrarSel = () => {
    const t = norm($('#selBusca').value);
    const mostrarOutros = $('#selOutros') ? $('#selOutros').checked : true;
    $$('#folhaCorpo .sel-item').forEach((el) => {
      el.hidden = (el.hasAttribute('data-outro') && !mostrarOutros) || (t && !t.split(' ').every((w) => el.dataset.busca.includes(w)));
    });
  };
  $('#selBusca').addEventListener('input', filtrarSel);
  if ($('#selOutros')) $('#selOutros').addEventListener('change', filtrarSel);
  $('#folhaCorpo').addEventListener('change', (e) => { if (e.target.name === 'sel') atualizarInfo(); });
  atualizarInfo();
  const r = await pr;
  if (!r || r.v !== 'ok' || !r.dados.length) return;
  const sel = r.dados;
  if (sel.length > livre && !await confirmar('Passa da capacidade', `<p>O ${esc(q.nome)} tem ${livre} vaga(s) e você selecionou ${sel.length}. Alocar mesmo assim?</p>`, 'Alocar mesmo assim', 'primario')) return;
  alocarVarios(sel.map((p) => [p, q.nome]));
  toast(`${sel.length} pessoa(s) no ${q.nome}`, 'ok');
}

function alocarVarios(pares) {
  if (!pares.length) return;
  enfileirar('atualizarVarios', {
    chaveColuna: colNome('codigo') || '',
    itens: pares.map(([p, nome]) => ({ linha: p.linha, chaveValor: p.codigo, valores: { [SIS.quarto]: nome } })),
  });
}

async function escolherQuarto(p) {
  const qs = listaQuartos();
  const oc = ocupacao();
  const compat = (q) => !q.sx || !p.sx || q.sx === p.sx;
  const ord = [...qs].sort((a, b) => (compat(b) - compat(a)));
  const r = await folha({
    titulo: p.quarto ? 'Trocar de quarto' : 'Escolher quarto',
    corpo: `${cabecalhoPessoa(p)}
      ${p.quarto ? `<button class="btn perigo bloco" value="tirar" style="margin-bottom:10px">Tirar do ${esc(p.quarto)}</button>` : ''}
      <div class="quartos-grade">${ord.map((q, i) => {
        const n = ocupantesDe(q, oc).length;
        const livre = q.camas - n;
        const atual = norm(q.nome) === norm(p.quarto);
        return `<button class="quarto ${livre <= 0 ? 'lotado' : ''} ${atual ? 'atual' : ''} ${compat(q) ? '' : 'incompat'}" value="q:${qs.indexOf(q)}">
          <span class="q-topo"><b>${esc(q.nome)}</b><i style="background:${corSexo(q.sx)}"></i></span>
          <span class="q-st">${atual ? 'Quarto atual' : livre <= 0 ? 'Lotado' : `${livre} vaga${livre > 1 ? 's' : ''}`} · ${esc(SEXO_TXT[q.sx])}</span>
        </button>${i < ord.length - 1 && compat(q) && !compat(ord[i + 1]) ? '</div><div class="secao">Outro sexo</div><div class="quartos-grade">' : ''}`;
      }).join('')}</div>`,
  });
  const v = respostaV(r);
  if (!v) return;
  if (v === 'tirar') { atualizar(p, { [SIS.quarto]: '' }); toast(`${p.nome} sem quarto.`); return; }
  const q = qs[+v.slice(2)];
  if (!q || norm(q.nome) === norm(p.quarto)) return;
  const livre = q.camas - ocupantesDe(q, oc).length;
  if (livre <= 0 && !await confirmar('Quarto lotado', `<p>O ${esc(q.nome)} já está cheio. Colocar ${esc(p.nome)} mesmo assim?</p>`, 'Colocar mesmo assim', 'primario')) return;
  if (!compat(q) && !await confirmar('Sexo diferente', `<p>O ${esc(q.nome)} é ${SEXO_TXT[q.sx].toLowerCase()}. Colocar ${esc(p.nome)} mesmo assim?</p>`, 'Colocar mesmo assim', 'primario')) return;
  const antes = p.quarto;
  atualizar(p, { [SIS.quarto]: q.nome });
  comemorar(`${primeiroNome(p)} → ${q.nome}`);
  toast(`${p.nome} no ${q.nome}`, 'ok', { rotulo: 'Desfazer', fn: () => atualizar(acharPessoaPorCodigo(p) || p, { [SIS.quarto]: antes || '' }) });
}

function planejarDistribuicao({ quem, juntos, separar, capela, colchoes }) {
  const oc = ocupacao();
  const semSexoQ = [], mistosOcupados = [];
  const quartos = [];
  for (const q of listaQuartos()) {
    if (q.cozinha) continue;
    const colchao = ehColchao(q);
    if (colchao ? colchoes !== 'sim' : capela !== 'todas' && q.andar !== capela) continue;
    const ocs = ocupantesDe(q, oc);
    const sxOc = [...new Set(ocs.map((p) => p.sx).filter(Boolean))];
    let sx = q.sx;
    if (!sx && sxOc.length > 1) { mistosOcupados.push(q.nome); continue; } // já tem homens e mulheres: não mexe
    if (!sx && colchao) { if (q.camas - ocs.length > 0) semSexoQ.push(q.nome); continue; } // colchões precisam ter sexo
    if (!sx) sx = sxOc[0] || '';
    quartos.push({ q, colchao, livre: q.camas - ocs.length, sx });
  }
  const cands = st.pessoas.filter((p) => !p.cancelado && !p.quarto && (quem === 'todos' || p.checkin));
  const semSexo = cands.filter((p) => !p.sx);
  const plano = [], semVaga = [];
  for (const sexo of ['f', 'm']) {
    const ps = cands.filter((p) => p.sx === sexo);
    const mapa = new Map();
    for (const p of ps) {
      let k = juntos === 'nenhum' ? '' : chaveNome(p[juntos]);
      if (!k) k = '~' + (juntos === 'nenhum' ? 'todos' : 'sem');
      if (separar) k += p.cat === 'equipe' ? '|eq' : '|en';
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(p);
    }
    const grupos = [...mapa.values()].sort((a, b) => b.length - a.length);
    for (const g of grupos) {
      const resto = [...g].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      while (resto.length) {
        // 1º camas dos quartos deste sexo (o grupo inteiro cabe? senão divide pelo quarto com mais vagas);
        // 2º quartos mistos vazios (passam a ser deste sexo); 3º colchões deste sexo, se escolhido.
        // Nunca coloca alguém em quarto ou colchão do outro sexo.
        const maior = (l) => [...l].sort((a, b) => b.livre - a.livre)[0];
        const livres = quartos.filter((x) => x.livre > 0);
        const mesmo = livres.filter((x) => !x.colchao && x.sx === sexo);
        const mistos = livres.filter((x) => !x.colchao && !x.sx);
        const colch = livres.filter((x) => x.colchao && x.sx === sexo);
        const r = mesmo.find((x) => x.livre >= resto.length) || maior(mesmo)
          || mistos.find((x) => x.livre >= resto.length) || maior(mistos) || maior(colch);
        if (!r) { semVaga.push(...resto); break; }
        const lote = resto.splice(0, Math.min(r.livre, resto.length));
        lote.forEach((p) => plano.push([p, r.q.nome]));
        r.livre -= lote.length;
        if (!r.sx) r.sx = sexo; // quarto misto passa a ser deste sexo
      }
    }
  }
  return { plano, semVaga, semSexo, semSexoQ, mistosOcupados, total: cands.length };
}

async function distribuir() {
  const r = await folha({
    titulo: 'Distribuir automaticamente',
    corpo: `<div class="form">
      <p class="muted" style="margin:0">Coloca quem está <b>sem quarto</b> nas vagas livres. Homens só em quartos e colchões masculinos, mulheres só nos femininos; quarto misto vazio passa a ser do sexo de quem entrar. Quem já tem quarto não muda. A Cozinha fica de fora.</p>
      <div><div class="rotulo-grupo">Capela</div>${radios('capela', [...listaCapelas().map((a) => [a, nomeCapela(a)]), ['todas', 'As duas']], listaCapelas()[0] || 'todas')}</div>
      <div><div class="rotulo-grupo">Onde colocar</div>${radios('colchoes', [['nao', 'Só camas'], ['sim', 'Camas e colchões']], 'nao')}
        <div class="muted peq" style="margin-top:4px">Com colchões, eles só são usados depois que as camas acabarem.</div></div>
      <div><div class="rotulo-grupo">Quem distribuir</div>${radios('quem', [['todos', 'Todos os inscritos'], ['presentes', 'Só quem fez check-in']], 'todos')}</div>
      <div><div class="rotulo-grupo">Manter juntos no mesmo quarto</div>${radios('juntos', [['discipulador', 'Discipulado'], ['lider', 'Célula (líder)'], ['nenhum', 'Tanto faz']], 'discipulador')}</div>
      <label class="interruptor">Separar equipe de encontristas <input type="checkbox" name="separar"></label>
    </div>`,
    botoes: [{ v: 'ok', t: 'Ver prévia', cls: 'primario' }],
    ler: (f) => ({ quem: f.quem.value, juntos: f.juntos.value, separar: f.separar.checked, capela: f.capela.value, colchoes: f.colchoes.value }),
  });
  if (!r || r.v !== 'ok') return;
  const { plano, semVaga, semSexo, semSexoQ, mistosOcupados, total } = planejarDistribuicao(r.dados);
  const ondeTxt = `${r.dados.capela === 'todas' ? 'As duas capelas' : nomeCapela(r.dados.capela)} · ${r.dados.colchoes === 'sim' ? 'camas e colchões' : 'só camas'}`;
  if (!total) { toast('Ninguém sem quarto para distribuir.'); return; }
  const porQuarto = new Map();
  for (const [p, nome] of plano) { if (!porQuarto.has(nome)) porQuarto.set(nome, []); porQuarto.get(nome).push(p); }
  const c = await folha({
    titulo: 'Prévia da distribuição',
    corpo: `
      <div class="muted peq" style="margin-bottom:8px">${esc(ondeTxt)}</div>
      <div class="kpis" style="margin-bottom:12px">
        ${kpi('Serão alocados', plano.length, `em ${porQuarto.size} quarto(s)`, 'ok')}
        ${kpi('Ficam sem quarto', semVaga.length + semSexo.length, semSexo.length ? `${semSexo.length} sem sexo informado` : semVaga.length ? 'faltou vaga' : '—', semVaga.length + semSexo.length ? 'erro' : '')}
      </div>
      <div class="dados">${[...porQuarto.entries()].map(([nome, ps]) => `<div style="display:block"><b style="color:var(--txt)">${esc(nome)} <span class="muted">+${ps.length}</span></b>
        <div class="muted peq">${ps.map((p) => esc(p.nome)).join(', ')}</div></div>`).join('') || '<div>Nenhuma vaga compatível.</div>'}</div>
      ${semSexo.length ? `<div class="aviso">Sem sexo informado (aloque pela ficha): ${semSexo.map((p) => esc(p.nome)).join(', ')}</div>` : ''}
      ${semVaga.length ? `<div class="aviso erro">Sem vaga: ${semVaga.map((p) => esc(p.nome)).join(', ')}</div>` : ''}
      ${semSexoQ.length ? `<div class="aviso">Não usados por não ter sexo definido: ${esc(semSexoQ.join(', '))}. Use "Dividir colchões por sexo" na tela Quartos.</div>` : ''}
      ${mistosOcupados.length ? `<div class="aviso">Não usados por já terem homens e mulheres: ${esc(mistosOcupados.join(', '))}.</div>` : ''}`,
    botoes: plano.length ? [{ v: 'ok', t: `Confirmar ${plano.length} alocações`, cls: 'primario' }] : [],
  });
  if (c !== 'ok') return;
  alocarVarios(plano);
  comemorar(`${plano.length} pessoas alocadas!`);
  toast(`${plano.length} pessoas distribuídas em ${porQuarto.size} quartos`, 'ok', {
    rotulo: 'Desfazer',
    fn: () => alocarVarios(plano.map(([p]) => [acharPessoaPorCodigo(p) || p, ''])),
  });
}

async function dividirColchoes() {
  const q = listaQuartos().find((x) => ehColchao(x) && !x.sx);
  if (!q) return;
  const ocs = ocupantesDe(q);
  if (ocs.length) { toast(`Tire as ${ocs.length} pessoa(s) do ${q.nome} antes de dividir.`, 'erro'); abrirQuarto(q.nome); return; }
  const r = await folha({
    titulo: 'Dividir colchões por sexo',
    corpo: `<div class="form">
      <p class="muted" style="margin:0">O ${esc(q.nome)} tem ${q.camas} colchões. Eles viram dois grupos: um masculino e um feminino.</p>
      <div class="duas-col"><label class="campo">Colchões masculinos<input name="m" inputmode="numeric" value="${Math.ceil(q.camas / 2)}"></label>
        <label class="campo">Colchões femininos<input name="f" inputmode="numeric" value="${Math.floor(q.camas / 2)}"></label></div></div>`,
    botoes: [{ v: 'ok', t: 'Dividir', cls: 'primario' }],
    ler: (f) => ({ m: Math.max(0, Math.round(numero(f.m.value))), f: Math.max(0, Math.round(numero(f.f.value))) }),
    validar: (d) => (d.m + d.f <= 0 ? 'Informe a quantidade.' : acharQuarto('Colchões femininos') || acharQuarto('Colchões masculinos') ? 'Já existe um grupo "Colchões masculinos" ou "Colchões femininos".' : ''),
  });
  if (!r) return;
  const { m, f } = r.dados;
  enfileirar('atualizar', { aba: ABA_Q, linha: q.linha, chaveColuna: colQ('quarto'), chaveValor: q.nome,
    valores: { [colQ('quarto')]: 'Colchões masculinos', [colQ('camas')]: String(m), [colQ('sexo')]: 'Masculino' } });
  enfileirar('inserir', { aba: ABA_Q, chaveColuna: colQ('quarto'), valores: {
    [colQ('quarto')]: 'Colchões femininos', [colQ('andar')]: q.andar, [colQ('ala')]: q.ala, [colQ('camas')]: String(f), [colQ('sexo')]: 'Feminino', [colQ('obs')]: q.obs,
  } });
  toast(`Colchões divididos: ${m} masculinos e ${f} femininos.`, 'ok');
}

async function novoQuarto() {
  const r = await folha({
    titulo: 'Novo quarto',
    corpo: `<div class="form">
      <label class="campo">Nome<input name="nome" placeholder="Ex.: Quarto 25"></label>
      <div class="duas-col"><label class="campo">Andar<input name="andar" placeholder="Cima, Baixo, Extras"></label><label class="campo">Ala<input name="ala"></label></div>
      <div class="duas-col"><label class="campo">Camas<input name="camas" inputmode="numeric"></label>
        <label class="campo">Sexo<select name="sexo"><option value="">Misto</option><option>Feminino</option><option>Masculino</option></select></label></div>
      <label class="campo">Observação<input name="obs"></label></div>`,
    botoes: [{ v: 'ok', t: 'Criar quarto', cls: 'primario' }],
    ler: (f) => Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()])),
    validar: (d) => (!d.nome ? 'Informe o nome.' : acharQuarto(d.nome) ? 'Já existe um quarto com esse nome.' : !(numero(d.camas) > 0) ? 'Informe o número de camas.' : ''),
  });
  if (!r) return;
  const d = r.dados;
  enfileirar('inserir', { aba: ABA_Q, chaveColuna: colQ('quarto'), valores: {
    [colQ('quarto')]: d.nome, [colQ('andar')]: d.andar, [colQ('ala')]: d.ala, [colQ('camas')]: String(Math.round(numero(d.camas))), [colQ('sexo')]: d.sexo, [colQ('obs')]: d.obs,
  } });
  toast(`${d.nome} criado.`, 'ok');
}

async function limparQuartos() {
  const com = ativosComQuarto();
  if (!await confirmar('Tirar todos dos quartos', `<p>Remove o quarto de <b>${com.length} pessoa(s)</b>. O mapa de quartos continua. Use para refazer a distribuição.</p>`, 'Tirar todos')) return;
  const antes = com.map((p) => [p, p.quarto]);
  alocarVarios(com.map((p) => [p, '']));
  toast('Todos sem quarto.', '', { rotulo: 'Desfazer', fn: () => alocarVarios(antes.map(([p, q]) => [acharPessoaPorCodigo(p) || p, q])) });
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

    <div class="secao">Quartos</div>
    <div class="kpis">
      ${(() => {
        const cap = listaQuartos().reduce((s, q) => s + q.camas, 0);
        const com = n((p) => !!p.quarto);
        return kpi('Com quarto', com, `${pct(com, tot)}% dos inscritos`, 'ok', 'comquarto') +
          kpi('Sem quarto', tot - com, tot - com ? 'toque para ver' : 'todos alocados', tot - com ? 'erro' : '', 'semquarto') +
          kpi('Vagas livres', Math.max(0, cap - com), `de ${cap} camas`, 'azul', 'tela:quartos');
      })()}
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
  semquarto: { t: 'Sem quarto', f: (p) => !p.quarto && !p.cancelado },
  saude: { t: 'Saúde ⚕', f: (p) => p.saude && !p.cancelado },
  comquarto: { t: 'Com quarto', f: (p) => !!p.quarto && !p.cancelado, extra: true },
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
  if (p.quarto) s.push(`<span class="selo pri">🛏 ${esc(completo ? p.quarto : rotuloQuarto(p.quarto))}</span>`);
  if (p.saude) s.push('<span class="selo azul">⚕ Saúde</span>');
  const ob = p.obs || p.obsArq;
  if (ob) s.push(`<span class="selo" title="${esc(ob)}">📝 ${esc(completo ? 'Obs.' : ob.length > 24 ? ob.slice(0, 22) + '…' : ob)}</span>`);
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
  if (st.guia) return cartaoGuia();
  const anterior = !cfg.local && ler(K.local, null);
  return `<div class="cartao">
    <h2>Entrar no evento</h2>
    <p class="muted">Digite o código que o responsável enviou (ou abra o link que ele mandou no WhatsApp).</p>
    <div class="form">
      <input id="codigoEvento" class="codigo-input" placeholder="ABCD-EFGH-JKLM-NPQR" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go">
      <button class="btn primario bloco grande" data-acao="entrarEvento">Entrar</button>
    </div>
  </div>
  <div class="cartao">
    <h2>Criar um evento</h2>
    <p class="muted">Para o responsável: abra a planilha de inscritos (<b>.xlsx</b> ou <b>.csv</b> exportada do site de ingressos).
      Ela vai para o banco e você recebe o código para enviar à equipe. Todos trabalham juntos, ao vivo.</p>
    <div class="form">
      <button class="btn bloco grande" data-acao="criarEvento">📂 Criar evento com a planilha</button>
      <button class="btn bloco" data-acao="ativarDemo">Ver demonstração com dados fictícios</button>
    </div>
    <details class="avancado" style="margin-top:14px"><summary>Outras opções</summary>
      <div class="form" style="margin-top:10px">
        ${anterior ? `<button class="btn bloco" data-acao="voltarLocal">Voltar para “${esc(anterior.planilha || 'arquivo aberto')}” (só neste aparelho)</button>` : ''}
        <button class="btn bloco" data-acao="abrirArquivo">Abrir planilha só neste aparelho, sem banco</button>
        <input id="colarLink" placeholder="Link de conexão do modo Google (#conectar=…)" autocomplete="off">
        <button class="btn bloco" data-acao="usarLink">Conectar pelo modo Google</button>
      </div>
    </details>
  </div>`;
}

function cartaoLocal() {
  const d = ler(K.local, null) || {};
  return `<div class="cartao">
    <div class="estado">
      <div class="bola"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <div style="min-width:0"><b>${esc(d.planilha || 'Planilha')}</b>
        <div class="muted peq">${st.pessoas.length} registros · salvo neste aparelho${d.abertoEm ? ' · aberto em ' + esc(d.abertoEm) : ''}</div></div>
    </div>
    <div class="form" style="margin-top:12px">
      <button class="btn primario bloco" data-acao="baixarPlanilha">⬇ Baixar planilha atualizada (.xlsx)</button>
      <button class="btn bloco" data-acao="abrirArquivo">📂 Abrir arquivo novo / juntar outro celular</button>
    </div>
    <p class="muted peq" style="margin-top:10px">Tudo o que for feito aqui (check-in, pagamento, quarto, cadastro) fica guardado <b>neste aparelho</b>, mesmo sem internet.
      Usando mais de um celular? No fim, baixe a planilha de cada um e abra aqui escolhendo <b>Juntar</b>.</p>
  </div>`;
}

/* Quando colam o link da planilha (ou do script) em vez do link de conexão. */
function cartaoGuia() {
  const g = st.guia;
  const script = g.tipo === 'script';
  return `<div class="cartao">
    <h2>${script ? 'Esse é o endereço do script' : 'Esse é o link da planilha'}</h2>
    ${script ? `<p>Pegue o <b>link de conexão</b> na planilha: menu <b>Encontro com Deus → Conectar celulares</b>, e cole aqui.</p>
      <div class="form"><input id="colarLink" placeholder="Cole aqui o link de conexão" autocomplete="off">
      <button class="btn primario bloco" data-acao="usarLink">Conectar</button></div>` : `
    <p>O jeito mais simples: baixe a planilha como arquivo e abra aqui.</p>
    <ol class="passos">
      <li>Abra a planilha${g.url ? ` (<a href="${esc(g.url)}" target="_blank" rel="noopener">abrir</a>)` : ''}.</li>
      <li>No computador: <b>Arquivo → Fazer download → Microsoft Excel (.xlsx)</b>.<br>No app do celular: <b>⋮ → Compartilhar e exportar → Salvar como → Excel</b>.</li>
      <li>Volte aqui e toque em <b>Criar evento com a planilha</b>.</li>
    </ol>
    <div class="form" style="margin-top:12px"><button class="btn primario bloco grande" data-acao="criarEvento">📂 Criar evento com a planilha</button></div>`}
    <div class="form" style="margin-top:8px"><button class="btn bloco" data-acao="fecharGuia">Voltar</button></div>
  </div>`;
}

function renderAjustes() {
  const el = $('#tela-ajustes');
  const conectado = configurado() && !cfg.demo && !cfg.local && !cfg.ev;
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  el.innerHTML = `
    ${cfg.demo ? `<div class="aviso">Você está no <b>modo demonstração</b>. Para usar de verdade, abra a planilha de inscritos abaixo.</div>` : ''}
    ${cfg.ev ? cartaoEvento() : conectado ? `
      <div class="cartao">
        <div class="estado">
          <div class="bola ${st.erro ? 'erro' : ''}"><svg viewBox="0 0 24 24">${st.erro ? '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>' : '<path d="M5 12.5l4.5 4.5L19 7.5"/>'}</svg></div>
          <div style="min-width:0"><b>${esc(cfg.nomePlanilha || st.planilha || 'Planilha conectada')}</b>
            <div class="muted peq">${st.erro ? esc(st.erro) : st.base ? `${st.pessoas.length} registros · ${st.aba ? 'aba ' + esc(st.aba) + ' · ' : ''}${st.carregadoEm ? 'atualizado às ' + hora(st.carregadoEm) : 'dados guardados no aparelho'}` : 'Carregando…'}</div></div>
        </div>
      </div>` : cfg.local ? cartaoLocal() : cartaoConectar()}

    ${configurado() ? `
    <div class="cartao form">
      <label class="campo">Nome deste aparelho / atendente <span class="muted" style="font-weight:400">vai para a planilha em cada check-in</span>
        <input id="cfgAtendente" value="${esc(cfg.atendente)}" placeholder="Ex.: Mesa 1 — Ana"></label>
      ${conectado ? `<button class="btn suave bloco" data-acao="compartilhar">Conectar outro celular (enviar link)</button>` : ''}
      ${instalado ? '' : st.instalar ? `<button class="btn primario bloco" data-acao="instalar">Instalar como aplicativo</button>`
        : `<div class="muted peq">Para usar como aplicativo: ${ios ? 'no Safari, toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.' : 'no menu do navegador (⋮), toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.'}</div>`}
    </div>` : ''}

    ${cfg.ev && !st.cab.length ? '' : `<div class="cartao">
      <details class="avancado"><summary>Configuração avançada</summary>
        ${cfg.ev ? '' : `<form id="formAvancado" class="form" style="margin-top:12px">
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
        </form>`}
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
            ${cfg.ev ? '' : '<button class="btn" data-acao="prepararColunas">Criar colunas de controle</button>'}
          </div>` : ''}
      </details>
    </div>`}

    ${cfg.ev ? '' : `<div class="cartao">
      <details class="avancado"><summary>Modo Google: instalar o Apps Script na planilha</summary>
        <ol class="passos">
          <li>Abra a planilha no Google Planilhas → <b>Extensões → Apps Script</b>.</li>
          <li>Apague o conteúdo, cole o código (botão abaixo) e salve.</li>
          <li><b>Implantar → Nova implantação → App da Web</b>. Executar como: <i>Eu</i>. Quem pode acessar: <i>Qualquer pessoa</i>. Autorize.</li>
          <li>Recarregue a planilha → menu <b>Encontro com Deus → Conectar celulares</b> → envie o link para a equipe.</li>
        </ol>
        <div class="linha-botoes"><button class="btn" data-acao="copiarScript">Copiar código</button>
          <a class="btn" href="apps-script/Codigo.gs" target="_blank" rel="noopener">Ver arquivo</a></div>
      </details>
    </div>`}

    <div class="cartao linha-botoes">
      ${cfg.demo ? '<button class="btn" data-acao="resetarDemo">Recriar dados fictícios</button>' : '<button class="btn" data-acao="ativarDemo">Modo demonstração</button>'}
      ${configurado() ? `<button class="btn perigo" data-acao="desconectar">${cfg.ev ? 'Sair do evento neste aparelho' : cfg.local ? 'Fechar planilha e apagar do aparelho' : 'Desconectar este aparelho'}</button>` : ''}
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
  const txt = String(texto || '').trim();
  const m = txt.match(/#conectar=([A-Za-z0-9_-]+)/) || txt.match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) {
    if (/docs\.google\.com\/spreadsheets|drive\.google\.com/i.test(txt)) st.guia = { tipo: 'planilha', url: txt.match(/https?:\/\/\S+/)?.[0] || '' };
    else if (/script\.google(usercontent)?\.com/i.test(txt)) st.guia = { tipo: 'script' };
    else { toast(txt ? 'Isso não parece um link de conexão. Ele vem do menu "Encontro com Deus → Conectar celulares" da planilha.' : 'Cole o link de conexão.', 'erro'); return; }
    irPara('ajustes'); renderAjustes(); scrollTo(0, 0);
    return;
  }
  st.guia = null;
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
  Object.assign(cfg, { url: d.u, chave: d.k, planilha: d.p || '', aba: d.a || '', nomePlanilha: d.n || '', demo: false, local: false, ev: '', mapa: {}, atendente: r.dados.atendente });
  salvarCfg();
  st.base = null; st.fila = []; salvarFila(); localStorage.removeItem(K.cache);
  await recarregar();
  if (st.base) { comemorar('Aparelho conectado!'); irPara('recepcao'); }
}

async function desconectar() {
  if (cfg.ev) {
    const pend = Nuvem.pendente() || !navigator.onLine;
    if (!await confirmar('Sair do evento',
      `<p>Este aparelho sai do evento e apaga a cópia dos dados guardada nele. <b>Os dados continuam no banco</b> para o resto da equipe; para voltar, é só entrar com o código.</p>${pend ? '<div class="aviso erro"><b>Há alterações ainda não enviadas</b> (sem internet). Se sair agora, elas se perdem.</div>' : ''}`,
      'Sair')) return;
    await Nuvem.sair();
    [K.cfg, K.cache, K.fila].forEach((k) => localStorage.removeItem(k));
    location.replace(location.pathname + '#ajustes');
    location.reload();
    return;
  }
  const pend = st.fila.length;
  if (!await confirmar('Desconectar aparelho',
    `<p>${cfg.local ? 'Apaga deste aparelho os dados do arquivo <b>e tudo o que foi feito nele</b> (check-ins, pagamentos, quartos). Baixe a planilha atualizada antes.' : 'Remove a conexão e os dados guardados neste aparelho. A planilha não é alterada.'}</p>${pend ? `<div class="aviso erro"><b>${pend} ação(ões) ainda não foram enviadas</b> e serão perdidas.</div>` : ''}`,
    'Desconectar')) return;
  [K.cfg, K.cache, K.fila, K.local].forEach((k) => localStorage.removeItem(k));
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
      if (v !== 'cancelar' && lerForm) {
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
  $('#faixaOffline').hidden = !((st.offline || (cfg.ev && !navigator.onLine)) && configurado() && !semNuvem());
  if (!configurado()) { s.textContent = 'não conectado'; return; }
  if (cfg.demo) { s.textContent = 'demonstração'; s.classList.add('ok'); return; }
  if (cfg.local) { s.textContent = 'salvo neste aparelho'; s.classList.add('ok'); return; }
  if (cfg.ev) {
    if (st.erro) { s.classList.add('offline'); s.textContent = 'erro no banco'; return; }
    if (!navigator.onLine || st.offline) { s.classList.add('offline'); s.textContent = 'sem internet · salvando no aparelho'; return; }
    if (Nuvem.pendente() || st.fila.length) { s.classList.add('pendente'); s.textContent = 'enviando…'; return; }
    s.classList.add('ok'); s.textContent = st.base ? 'ao vivo' : 'conectando…'; return;
  }
  if (st.offline) { s.classList.add('offline'); s.textContent = st.fila.length ? `sem internet · ${st.fila.length} a enviar` : 'sem internet'; return; }
  if (st.fila.length) { s.classList.add('pendente'); s.textContent = `enviando ${st.fila.length}…`; return; }
  if (st.erro) { s.classList.add('offline'); s.textContent = 'erro na planilha'; return; }
  s.classList.add('ok');
  s.textContent = st.carregadoEm ? `sincronizado ${hora(st.carregadoEm)}` : 'conectando…';
}

/* ================= navegação ================= */
const TELAS = ['painel', 'recepcao', 'quartos', 'ajustes'];
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
  if (t === 'quartos') renderQuartos();
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
  if (h.startsWith('#evento=')) { entrarEvento(h); return; }
  if (h === '#naopagos') st.filtro = 'naopagos';
  else if (String(e.oldURL).endsWith('#naopagos') && st.filtro === 'naopagos') st.filtro = 'todos';
  st.limite = 80;
  renderizar();
  window.scrollTo(0, 0);
});

/* ================= eventos ================= */
document.addEventListener('click', async (e) => {
  const alvo = e.target.closest('[data-checkin], [data-ficha], [data-filtro], [data-ir-filtro], [data-quarto], [data-painel-grupo], [data-painel-cat], [data-acao]');
  if (!alvo || alvo.closest('#folha')) return;
  const d = alvo.dataset;
  if (d.checkin) { e.stopPropagation(); const p = acharPessoa(d.checkin); if (p) fazerCheckin(p); return; }
  if (d.ficha) { const p = acharPessoa(d.ficha); if (p) abrirFicha(p); return; }
  if (d.filtro) { st.filtro = d.filtro; st.limite = 80; if (location.hash === '#naopagos') history.replaceState(null, '', '#recepcao'); renderizar(); return; }
  if (d.irFiltro && d.irFiltro.startsWith('tela:')) { irPara(d.irFiltro.slice(5)); return; }
  if (d.irFiltro) { st.filtro = d.irFiltro; st.busca = ''; $('#busca').value = ''; irPara('recepcao'); return; }
  if (d.quarto) { abrirQuarto(d.quarto); return; }
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
    case 'voltarLocal': Nuvem.parar(); Object.assign(cfg, { local: true, demo: false, ev: '', mapa: {} }); salvarCfg(); st.base = null; await recarregar(); irPara('recepcao'); break;
    case 'abrirArquivo': st.modoArquivo = 'local'; $('#arquivo').click(); break;
    case 'criarEvento': st.modoArquivo = 'criar'; $('#arquivo').click(); break;
    case 'importarEvento': st.modoArquivo = 'importar'; $('#arquivo').click(); break;
    case 'entrarEvento': entrarEvento($('#codigoEvento').value); break;
    case 'mostrarCodigo': mostrarCodigo(); break;
    case 'baixarPlanilha': baixarPlanilha(); break;
    case 'fecharGuia': st.guia = null; renderAjustes(); break;
    case 'ativarDemo': Nuvem.parar(); cfg.demo = true; cfg.local = false; cfg.ev = ''; salvarCfg(); st.base = null; await recarregar(); irPara('painel'); toast('Modo demonstração: dados fictícios.'); break;
    case 'resetarDemo': localStorage.removeItem(K.demo); await recarregar(); toast('Dados fictícios recriados.', 'ok'); break;
    case 'desconectar': desconectar(); break;
    case 'distribuir': distribuir(); break;
    case 'dividirColchoes': dividirColchoes(); break;
    case 'novoQuarto': novoQuarto(); break;
    case 'limparQuartos': limparQuartos(); break;
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

$('#arquivo').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  const modo = st.modoArquivo || 'local';
  st.modoArquivo = '';
  if (!f) return;
  if (modo === 'criar') criarEventoComArquivo(f);
  else if (modo === 'importar') importarNoEvento(f);
  else importarArquivo(f);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'codigoEvento') { e.preventDefault(); entrarEvento(e.target.value); }
});
window.addEventListener('online', () => { st.offline = false; enviarFila(); if (cfg.ev) atualizarStatus(); else recarregar({ silencioso: true }); });
window.addEventListener('offline', () => { st.offline = true; atualizarStatus(); });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); st.instalar = e; if (telaAtual() === 'ajustes') renderAjustes(); });

/* Atualização automática (outras mesas, novas compras no app) */
setInterval(() => {
  if (document.hidden || $('#folha').open || !configurado() || cfg.ev) return;
  if (telaAtual() === 'ajustes') return;
  recarregar({ silencioso: true });
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && configurado() && !cfg.ev && (!st.carregadoEm || Date.now() - st.carregadoEm > 15000)) recarregar({ silencioso: true });
});

/* ================= arquivo local (.xlsx / .csv) ================= */
// Sem bibliotecas: lê o .zip do xlsx com DecompressionStream e o XML com DOMParser.
const Arq = {
  async ler(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const zip = buf[0] === 0x50 && buf[1] === 0x4b;
    const t = zip ? await Arq.xlsx(buf) : Arq.csv(Arq.texto(buf));
    const limpar = (v) => {
      let x = String(v ?? '').trim();
      if (/^-?\d+\.0+$/.test(x)) x = x.replace(/\.0+$/, '');
      else if (/^-?\d+(\.\d+)?e\+?\d+$/i.test(x) && Number.isSafeInteger(Number(x))) x = String(Number(x));
      return x;
    };
    const linhas = t.linhas.map((l) => (l || []).map(limpar));
    const hi = linhas.findIndex((l) => l.filter(Boolean).length >= 2);
    if (hi < 0) throw new Error('Não achei dados nesse arquivo.');
    const cab = linhas[hi].map((h, i) => h || `Coluna ${i + 1}`);
    const corpo = linhas.slice(hi + 1).filter((l) => l.some(Boolean)).map((l) => cab.map((_, i) => l[i] ?? ''));
    return { cab, linhas: corpo, aba: t.aba || 'Inscritos', quartos: t.quartos || null };
  },
  texto(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
    catch { return new TextDecoder('windows-1252').decode(buf); }
  },
  csv(txt) {
    const prim = txt.split(/\r?\n/, 1)[0];
    const sep = [';', ',', '\t'].map((c) => [c, prim.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
    const out = []; let l = [], v = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { v += '"'; i++; } else q = false; } else v += c; }
      else if (c === '"') q = true;
      else if (c === sep) { l.push(v); v = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; l.push(v); out.push(l); l = []; v = ''; }
      else v += c;
    }
    if (v || l.length) { l.push(v); out.push(l); }
    return { linhas: out };
  },
  async unzip(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = b.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Arquivo .xlsx danificado.');
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const arqs = {};
    for (let i = 0; i < n; i++) {
      const met = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      arqs[nome] = { met, off, tam };
      p += 46 + nl + xl + cl;
    }
    return async (nome) => {
      const a = arqs[nome] || arqs[Object.keys(arqs).find((k) => k.toLowerCase() === nome.toLowerCase())];
      if (!a) return null;
      const ini = a.off + 30 + dv.getUint16(a.off + 26, true) + dv.getUint16(a.off + 28, true);
      const dado = b.subarray(ini, ini + a.tam);
      if (a.met === 0) return new TextDecoder().decode(dado);
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não abre .xlsx. Atualize o navegador ou use .csv.');
      const s = new Blob([dado]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(s).arrayBuffer());
    };
  },
  async xlsx(buf) {
    const lerZ = await Arq.unzip(buf);
    const xml = async (n) => { const t = await lerZ(n); return t ? new DOMParser().parseFromString(t, 'application/xml') : null; };
    const tags = (d, n) => [...d.getElementsByTagNameNS('*', n)];
    const wb = await xml('xl/workbook.xml');
    if (!wb) throw new Error('Isso não parece uma planilha .xlsx.');
    const rels = await xml('xl/_rels/workbook.xml.rels');
    const alvo = (id) => {
      const r = tags(rels, 'Relationship').find((x) => x.getAttribute('Id') === id);
      const t = r ? r.getAttribute('Target') : '';
      return t.startsWith('/') ? t.slice(1) : 'xl/' + t;
    };
    const ss = await xml('xl/sharedStrings.xml');
    const strs = ss ? tags(ss, 'si').map((si) => tags(si, 't').map((t) => t.textContent).join('')) : [];
    // células com formato de data viram dd/mm/aaaa
    const sty = await xml('xl/styles.xml');
    const fmtData = new Set([14, 15, 16, 17, 22, 45, 46, 47]);
    if (sty) tags(sty, 'numFmt').forEach((f) => { if (/[dy]/i.test((f.getAttribute('formatCode') || '').replace(/\[[^\]]*\]|"[^"]*"/g, ''))) fmtData.add(+f.getAttribute('numFmtId')); });
    const cx = sty && tags(sty, 'cellXfs')[0];
    const xfs = cx ? tags(cx, 'xf') : [];
    const ehData = (s) => xfs[s] && fmtData.has(+xfs[s].getAttribute('numFmtId'));
    const data = (n) => {
      const d = new Date(Math.round((n - 25569) * 864e5)); const p2 = (x) => String(x).padStart(2, '0');
      const dt = `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
      return n % 1 ? `${dt} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : dt;
    };
    const col = (ref) => { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const lerAba = async (sh) => {
      const d = await xml(alvo(sh.getAttributeNS(RNS, 'id') || sh.getAttribute('r:id')));
      if (!d) return [];
      const out = [];
      for (const row of tags(d, 'row')) {
        const l = []; let k = 0;
        for (const c of tags(row, 'c')) {
          const r = c.getAttribute('r'); if (r) k = col(r);
          const t = c.getAttribute('t'); const v = tags(c, 'v')[0]?.textContent ?? '';
          let val;
          if (t === 's') val = strs[+v] ?? '';
          else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
          else if (t === 'b') val = v === '1' ? 'VERDADEIRO' : 'FALSO';
          else if (v !== '' && !t && ehData(+(c.getAttribute('s') || 0))) val = data(+v);
          else if (v !== '' && !t && isFinite(+v)) val = Number.isSafeInteger(+v) ? String(+v) : String(+(+v).toPrecision(15));
          else val = v;
          l[k++] = val;
        }
        const ri = +(row.getAttribute('r') || out.length + 1) - 1;
        out[ri] = Array.from(l, (x) => x ?? '');
      }
      return Array.from(out, (x) => x || []);
    };
    const sheets = tags(wb, 'sheet');
    const qs = sheets.find((x) => norm(x.getAttribute('name')) === norm(ABA_Q));
    const princ = sheets.find((x) => x !== qs) || sheets[0];
    let quartos = null;
    if (qs) {
      const q = await lerAba(qs);
      if (q.length > 1) quartos = { cab: q[0].map(String), linhas: q.slice(1).filter((l) => l.some(Boolean)).map((l) => q[0].map((_, i) => String(l[i] ?? ''))) };
    }
    return { aba: princ.getAttribute('name'), linhas: await lerAba(princ), quartos };
  },

  /* --- gravar .xlsx (zip sem compressão) --- */
  crcT: null,
  crc(b) {
    if (!Arq.crcT) {
      Arq.crcT = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; Arq.crcT[n] = c >>> 0; }
    }
    let c = 0xffffffff;
    for (const x of b) c = Arq.crcT[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  },
  zip(arqs) {
    const enc = new TextEncoder(); const partes = []; const cent = []; let off = 0;
    const pr = (dv, campos) => campos.forEach(([o, v, t]) => (t === 4 ? dv.setUint32(o, v, true) : dv.setUint16(o, v, true)));
    for (const [nome, txt] of Object.entries(arqs)) {
      const n = enc.encode(nome), d = enc.encode(txt), crc = Arq.crc(d);
      const h = new DataView(new ArrayBuffer(30));
      pr(h, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, d.length, 4], [22, d.length, 4], [26, n.length, 2], [28, 0, 2]]);
      const c = new DataView(new ArrayBuffer(46));
      pr(c, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, d.length, 4], [24, d.length, 4], [28, n.length, 2], [42, off, 4]]);
      partes.push(h, n, d); cent.push(c, n);
      off += 30 + n.length + d.length;
    }
    const tamC = cent.reduce((s, x) => s + x.byteLength, 0);
    const qtd = Object.keys(arqs).length;
    const e = new DataView(new ArrayBuffer(22));
    pr(e, [[0, 0x06054b50, 4], [8, qtd, 2], [10, qtd, 2], [12, tamC, 4], [16, off, 4]]);
    return new Blob([...partes, ...cent, e], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  },
  gerarXlsx(abas) { // abas: [{ nome, cab, linhas }]
    const x = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const letra = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    const nomeAba = (n) => x(String(n).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Planilha');
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const XD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const f = {
      '[Content_Types].xml': `${XD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
      '_rels/.rels': `${XD}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `${XD}<workbook xmlns="${NS}" xmlns:r="${R}"><sheets>${abas.map((a, i) => `<sheet name="${nomeAba(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `${XD}<Relationships xmlns="${PR}">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': `${XD}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
    };
    abas.forEach((a, i) => {
      const linha = (l, r, neg) => `<row r="${r}">${l.map((v, c) => (String(v ?? '') === '' ? '' : `<c r="${letra(c)}${r}" t="inlineStr"${neg ? ' s="1"' : ''}><is><t xml:space="preserve">${x(v)}</t></is></c>`)).join('')}</row>`;
      f[`xl/worksheets/sheet${i + 1}.xml`] = `${XD}<worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${linha(a.cab, 1, true)}${a.linhas.map((l, j) => linha(l, j + 2)).join('')}</sheetData></worksheet>`;
    });
    return Arq.zip(f);
  },
};

/* Junta o arquivo novo com o que já está no aparelho, pelo Código:
 * o que foi feito na recepção (check-in, pagamento, quarto, cadastros "R…") não se perde. */
function juntarDados(velho, novo) {
  const cab = [...novo.cab], linhas = novo.linhas.map((l) => [...l]);
  const vc = velho.cab;
  const ci = (cb, re) => cb.map(norm).findIndex((h) => re.test(h));
  const kN = ci(cab, /^codigo$/), kV = ci(vc, /^codigo$/);
  if (kN < 0 || kV < 0) return null;
  const preservar = Object.values(SIS);
  garantirEm(cab, linhas, preservar.filter((c) => vc.includes(c)));
  const uN = ci(cab, /^usado$/), uV = ci(vc, /^usado$/), sN = ci(cab, /^status$/), sV = ci(vc, /^status$/);
  const porCod = new Map(linhas.map((l) => [String(l[kN]).trim(), l]));
  let juntados = 0, novos = 0;
  for (const lv of velho.linhas) {
    const cod = String(lv[kV] ?? '').trim();
    if (!cod) continue;
    let ln = porCod.get(cod);
    if (!ln) { // só existia no aparelho (ex.: cadastro feito na recepção)
      ln = cab.map((h) => { const j = vc.indexOf(h); return j >= 0 ? String(lv[j] ?? '') : ''; });
      linhas.push(ln); porCod.set(cod, ln); novos++; continue;
    }
    let mudou = false;
    for (const c of preservar) {
      const j = vc.indexOf(c), k = cab.indexOf(c);
      if (j >= 0 && k >= 0 && String(lv[j] ?? '') && !String(ln[k] ?? '')) { ln[k] = lv[j]; mudou = true; }
    }
    if (uN >= 0 && uV >= 0 && norm(lv[uV]) === 'usado' && norm(ln[uN]) !== 'usado') { ln[uN] = lv[uV]; mudou = true; }
    if (sN >= 0 && sV >= 0 && /^(pago|aprovado)/.test(norm(lv[sV])) && !/^(pago|aprovado)/.test(norm(ln[sN]))) { ln[sN] = lv[sV]; mudou = true; }
    if (mudou) juntados++;
  }
  return { cab, linhas, juntados, novos };
}

async function importarArquivo(file) {
  if (!file) return;
  let t;
  try { t = await Arq.ler(file); } catch (e) { toast(e.message || 'Não consegui ler esse arquivo.', 'erro'); return; }
  const m = mapear(t.cab);
  if (m.nome < 0 && m.comprador < 0 && m.codigo < 0) { toast('Não achei as colunas de nome ou código nesse arquivo. É a planilha de inscritos?', 'erro'); return; }
  const velho = cfg.local ? ler(K.local, null) : null;
  const vAba = velho && velho.abas && velho.abas[velho.aba];
  let modo = 'substituir';
  if (vAba && vAba.linhas.length) {
    modo = await folha({
      titulo: 'Já tem uma planilha aberta',
      corpo: `<p>O arquivo <b>${esc(file.name)}</b> tem <b>${t.linhas.length}</b> registros. Neste aparelho há <b>${vAba.linhas.length}</b>.</p>
        <p><b>Juntar</b> (recomendado): usa o arquivo novo e mantém o que foi feito aqui — check-ins, pagamentos, quartos e cadastros da recepção.
        Serve para pegar inscrições novas ou para juntar a planilha baixada de outro celular.</p>
        <p class="muted peq"><b>Substituir</b> apaga o que está neste aparelho e fica só com o arquivo novo.</p>`,
      botoes: [{ v: 'substituir', t: 'Substituir', cls: 'perigo' }, { v: 'juntar', t: 'Juntar', cls: 'primario' }],
    });
    if (!modo) return;
  }
  if (st.fila.length) await enviarFila();
  let cab = t.cab, linhas = t.linhas, msg = `${t.linhas.length} registros carregados.`;
  if (modo === 'juntar') {
    const j = juntarDados({ cab: vAba.cab, linhas: vAba.linhas }, t);
    if (!j) { toast('Sem a coluna "Código" não dá para juntar. Use Substituir.', 'erro'); return; }
    ({ cab, linhas } = j);
    msg = `${linhas.length} registros · ${j.juntados} completados com o que já estava aqui${j.novos ? ` · ${j.novos} cadastros deste aparelho mantidos` : ''}.`;
  }
  const abas = { [t.aba]: { cab, linhas } };
  const q = t.quartos || (velho && velho.abas && velho.abas[ABA_Q]);
  if (q) abas[ABA_Q] = { cab: [...q.cab], linhas: q.linhas.map((l) => [...l]) };
  try {
    localStorage.setItem(K.local, JSON.stringify({ planilha: file.name.replace(/\.(xlsx|csv|txt)$/i, ''), aba: t.aba, abas, abertoEm: agora() }));
  } catch { toast('A memória do navegador está cheia.', 'erro'); return; }
  Nuvem.parar();
  Object.assign(cfg, { local: true, demo: false, ev: '', url: '', chave: '', planilha: '', aba: '', mapa: {} });
  salvarCfg();
  st.base = null; st.fila = []; salvarFila(); st.guia = null; st.erro = null; localStorage.removeItem(K.cache);
  await recarregar();
  if (st.base) { comemorar('Planilha aberta!'); toast(msg, 'ok'); irPara('recepcao'); }
}

async function baixarPlanilha() {
  if (st.fila.length) await enviarFila();
  if (!st.base) { toast('Ainda não há dados para baixar.', 'erro'); return; }
  const abas = [{ nome: st.aba || 'Inscritos', cab: st.cab, linhas: st.linhas }];
  if (st.q.linhas.length) abas.push({ nome: ABA_Q, cab: st.q.cab, linhas: st.q.linhas });
  const blob = Arq.gerarXlsx(abas);
  const base = (st.planilha || cfg.evento || 'encontro').replace(/ - atualizada.*$/, '').replace(/[^\w\-. À-ú]+/g, '').trim() || 'encontro';
  const nome = `${base} - ${agora().replace(/\//g, '-').replace(':', 'h')}.xlsx`;
  // No celular, abre o "compartilhar" (WhatsApp, Drive, e-mail…); no PC, baixa.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare) {
    const arq = new File([blob], nome, { type: blob.type });
    if (navigator.canShare({ files: [arq] })) {
      try { await navigator.share({ files: [arq], title: nome }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Planilha baixada.', 'ok');
}

/* ================= banco na nuvem (Firebase / Firestore) ================= */
// Cada evento é o documento eventos/{CÓDIGO}. Quem tem o código entra (regras em firestore.rules).
// Linhas = documentos em eventos/{ev}/pessoas e eventos/{ev}/quartos: { o: ordem, v: { c0: valor, c1: … } },
// com os nomes das colunas em eventos/{ev}.cabPessoas / cabQuartos (só crescem, nunca reordenam).
const FB_CONFIG = {
  apiKey: 'AIzaSyAsvKHL0zLaAMzwjlMZ6Q3TuYK9ayNI5_8',
  authDomain: 'encontro-com-deus-7dd79.firebaseapp.com',
  projectId: 'encontro-com-deus-7dd79',
  storageBucket: 'encontro-com-deus-7dd79.firebasestorage.app',
  messagingSenderId: '879137016377',
  appId: '1:879137016377:web:f132a65ee6bfa63c945be8',
};
const FB_SDK = 'https://www.gstatic.com/firebasejs/13.4.0/';
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const gerarCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => ALFA[x % 32]).join('').match(/.{4}/g).join('-');
const normCodigo = (s) => {
  const m = String(s || '').match(/#evento=([A-Za-z0-9-]+)/);
  const c = (m ? m[1] : String(s || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 16 ? c.match(/.{4}/g).join('-') : '';
};
const idDoc = (s) => (String(s ?? '').trim().replace(/\//g, '_').replace(/^\.+$/, '_').replace(/^__(.*)__$/, '_$1_').slice(0, 400)) || '_';
const comTempo = (p, ms, msg) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new ErroRede(msg)), ms))]);

const Nuvem = {
  fb: null, db: null, ev: '', un: [], pronto: null, estado: null, _carregando: null, _t: null,

  async iniciar() {
    if (Nuvem.fb) return Nuvem.fb;
    if (!Nuvem._carregando) {
      Nuvem._carregando = (async () => {
        let a, au, fs;
        try { [a, au, fs] = await Promise.all(['app', 'auth', 'firestore'].map((m) => import(FB_SDK + `firebase-${m}.js`))); }
        catch { throw new ErroRede('Sem internet para abrir o banco.'); }
        const app = a.initializeApp(FB_CONFIG);
        let db;
        try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
        catch { db = fs.getFirestore(app); }
        const auth = au.getAuth(app);
        await new Promise((res) => { const u = au.onAuthStateChanged(auth, () => { u(); res(); }); });
        if (!auth.currentUser) {
          try { await au.signInAnonymously(auth); } catch (e) { throw (e.code === 'auth/network-request-failed' ? new ErroRede('Sem internet.') : e); }
        }
        Nuvem.db = db;
        Nuvem.fb = { fs, au, auth };
        return Nuvem.fb;
      })().catch((e) => { Nuvem._carregando = null; throw e; });
    }
    return Nuvem._carregando;
  },

  parar() {
    Nuvem.un.forEach((u) => { try { u(); } catch { /* já parado */ } });
    Nuvem.un = []; Nuvem.ev = ''; Nuvem.pronto = null; Nuvem.estado = null;
  },

  evRef(ev = cfg.ev) { return Nuvem.fb.fs.doc(Nuvem.db, 'eventos', ev); },

  // Escuta o evento ao vivo: qualquer mudança (de qualquer celular) atualiza a tela.
  async ouvir(ev) {
    await Nuvem.iniciar();
    if (Nuvem.ev === ev && Nuvem.pronto) return Nuvem.pronto;
    Nuvem.parar();
    Nuvem.ev = ev;
    const { fs } = Nuvem.fb;
    const E = Nuvem.estado = { ev: null, existe: null, pessoas: new Map(), quartos: new Map(), pend: {}, cache: {}, idsP: [], idsQ: [] };
    let ok, falhou;
    Nuvem.pronto = new Promise((r, j) => { ok = r; falhou = j; });
    Nuvem.pronto.catch(() => { /* tratado em api() */ });
    const prim = { ev: false, p: false, q: false };
    const marcar = (k, s) => {
      prim[k] = true;
      E.pend[k] = s.metadata.hasPendingWrites;
      E.cache[k] = s.metadata.fromCache;
      if (prim.ev && prim.p && prim.q) { ok(); Nuvem.mudou(); }
    };
    const erro = (e) => {
      const msg = e.code === 'permission-denied' ? 'Sem acesso a esse evento. Confira o código.' : 'Banco: ' + e.message;
      falhou(new Error(msg));
      if (Nuvem.estado === E) { st.erro = msg; renderizarSoft(); }
    };
    const opt = { includeMetadataChanges: true };
    const ref = Nuvem.evRef(ev);
    Nuvem.un.push(fs.onSnapshot(ref, opt, (s) => {
      if (!s.exists() && s.metadata.fromCache) return; // ainda não sabe (sem internet): espera o servidor
      E.ev = s.exists() ? s.data() : null;
      E.existe = s.exists();
      marcar('ev', s);
    }, erro));
    for (const [k, col] of [['p', 'pessoas'], ['q', 'quartos']]) {
      Nuvem.un.push(fs.onSnapshot(fs.collection(ref, col), opt, (s) => {
        const m = k === 'p' ? E.pessoas : E.quartos;
        s.docChanges().forEach((c) => { if (c.type === 'removed') m.delete(c.doc.id); else m.set(c.doc.id, c.doc.data()); });
        marcar(k, s);
      }, erro));
    }
    return Nuvem.pronto;
  },

  pendente() { const E = Nuvem.estado; return !!E && Object.values(E.pend).some(Boolean); },

  montar() {
    const E = Nuvem.estado;
    const d = E.ev || {};
    const tab = (cab, m) => {
      const docs = [...m.entries()].sort((a, b) => ((a[1].o ?? 0) - (b[1].o ?? 0)) || (a[0] < b[0] ? -1 : 1));
      return { ids: docs.map((x) => x[0]), linhas: docs.map(([, x]) => cab.map((_, i) => String((x.v || {})['c' + i] ?? ''))) };
    };
    const cabP = d.cabPessoas || [], cabQ = d.cabQuartos || CAB_Q;
    const P = tab(cabP, E.pessoas), Q = tab(cabQ, E.quartos);
    E.idsP = P.ids; E.idsQ = Q.ids;
    return {
      planilha: d.nome || 'Evento', aba: 'Inscritos', abas: ['Inscritos', ABA_Q],
      cabecalho: [...cabP], linhas: P.linhas,
      outras: { [ABA_Q]: E.quartos.size ? { cabecalho: [...cabQ], linhas: Q.linhas } : null },
    };
  },

  // Atualiza a tela quando o banco muda (com um pequeno atraso para juntar várias mudanças).
  mudou() {
    clearTimeout(Nuvem._t);
    Nuvem._t = setTimeout(() => {
      const E = Nuvem.estado;
      if (!cfg.ev || !E || !E.ev) { atualizarStatus(); return; }
      const r = Nuvem.montar();
      usarBase({ cabecalho: r.cabecalho, linhas: r.linhas, abas: r.abas, planilha: r.planilha, aba: r.aba, quartos: r.outras[ABA_Q] });
      if (st.q.existe) st.criandoQuartos = false; else garantirAbaQuartos();
      st.carregadoEm = new Date();
      st.erro = null;
      salvarCache();
      renderizarSoft();
    }, 120);
  },

  // Mesma "API" do Apps Script e do modo demonstração: o resto do app não precisa saber onde está o banco.
  async api(acao, p) {
    try { await comTempo(Nuvem.ouvir(cfg.ev), 20000, 'Sem conexão com o banco.'); }
    catch (e) { if (Nuvem.estado && Nuvem.ev === cfg.ev && !(e instanceof ErroRede)) Nuvem.parar(); throw e; }
    const E = Nuvem.estado;
    if (E.existe === false) throw new Error('Evento não encontrado. Confira o código.');
    if (acao === 'ler') return { ok: true, ...Nuvem.montar() };

    const { fs } = Nuvem.fb;
    const ref = Nuvem.evRef();
    const b = fs.writeBatch(Nuvem.db);
    const ehQ = p.aba === ABA_Q || acao === 'garantirAba';
    const nomeCab = ehQ ? 'cabQuartos' : 'cabPessoas';
    const cab0 = (E.ev && E.ev[nomeCab]) || (ehQ ? CAB_Q : []);
    const cab = [...cab0];
    const idx = (col) => { let i = cab.indexOf(col); if (i < 0) { cab.push(col); i = cab.length - 1; } return i; };
    const colRef = fs.collection(ref, ehQ ? 'quartos' : 'pessoas');
    const mapa = ehQ ? E.quartos : E.pessoas;
    const ids = ehQ ? E.idsQ : E.idsP;
    const acharId = (it) => {
      if (it.chaveValor) {
        const id = idDoc(it.chaveValor);
        if (mapa.has(id)) return id;
        const k = cab.indexOf(it.chaveColuna);
        if (k >= 0) for (const [i, d] of mapa) if (String((d.v || {})['c' + k] ?? '').trim() === it.chaveValor) return i;
      }
      return ids[(it.linha || 0) - 2] || null;
    };
    const valoresV = (valores) => { const f = {}; for (const [k, v] of Object.entries(valores || {})) f['v.c' + idx(k)] = String(v ?? ''); return f; };

    if (acao === 'atualizar' || acao === 'atualizarVarios') {
      const itens = acao === 'atualizar' ? [p] : p.itens.map((it) => ({ chaveColuna: p.chaveColuna, ...it }));
      let n = 0;
      for (const it of itens) {
        const id = acharId(it);
        if (!id) continue;
        const f = valoresV(it.valores);
        if (Object.keys(f).length) { b.update(fs.doc(colRef, id), f); n++; }
      }
      if (!n && acao === 'atualizar') throw new Error('Registro não encontrado.');
    } else if (acao === 'inserir') {
      const v = p.valores || {};
      const chave = v[p.chaveColuna];
      const id = chave ? idDoc(chave) : fs.doc(colRef).id;
      if (mapa.has(id)) return { ok: true, jaExistia: true };
      const vv = {};
      for (const [k, x] of Object.entries(v)) vv['c' + idx(k)] = String(x ?? '');
      b.set(fs.doc(colRef, id), { o: Date.now(), v: vv });
    } else if (acao === 'garantirColunas') {
      (p.colunas || []).forEach(idx);
    } else if (acao === 'garantirAba') {
      if (p.nome !== ABA_Q || E.quartos.size) return { ok: true };
      cab.length = 0; cab.push(...p.cabecalho);
      p.linhas.forEach((l, i) => b.set(fs.doc(colRef, idDoc(l[0])), { o: i, v: Object.fromEntries(l.map((x, j) => ['c' + j, String(x ?? '')])) }));
    } else throw new Error('Ação desconhecida: ' + acao);

    if (cab.length !== cab0.length || acao === 'garantirAba') b.update(ref, { [nomeCab]: cab });
    // Não espera o servidor: o Firestore grava no aparelho na hora e envia sozinho quando houver internet.
    b.commit().catch((e) => { toast('Não foi gravado no banco: ' + (e.code === 'permission-denied' ? 'sem permissão' : e.message), 'erro'); });
    return { ok: true };
  },

  // Grava linhas em lotes (o Firestore aceita até 500 operações por lote).
  async gravarEmLotes(ops) {
    const { fs } = Nuvem.fb;
    for (let i = 0; i < ops.length; i += 400) {
      const b = fs.writeBatch(Nuvem.db);
      ops.slice(i, i + 400).forEach(([ref, dados, merge]) => (merge ? b.set(ref, dados, { merge: true }) : b.set(ref, dados)));
      await comTempo(b.commit(), 60000, 'A internet caiu no meio do envio. Tente de novo.');
    }
  },

  async criarEvento(nome, t) {
    if (!navigator.onLine) throw new Error('Precisa de internet para criar o evento.');
    await Nuvem.iniciar();
    const { fs } = Nuvem.fb;
    const codigo = gerarCodigo();
    const ref = Nuvem.evRef(codigo);
    const cab = [...t.cab];
    Object.values(SIS).forEach((c) => { if (!cab.includes(c)) cab.push(c); });
    const qs = t.quartos && t.quartos.linhas.length ? t.quartos : { cab: CAB_Q, linhas: QUARTOS_PADRAO.map((l) => l.map(String)) };
    await comTempo(fs.setDoc(ref, { nome, criadoEm: fs.serverTimestamp(), cabPessoas: cab, cabQuartos: [...qs.cab] }), 30000, 'Sem conexão com o banco.');
    const ops = [];
    const kc = t.cab.map(norm).findIndex((h) => h === 'codigo');
    const usados = new Set();
    t.linhas.forEach((l, i) => {
      let id = kc >= 0 && l[kc] ? idDoc(l[kc]) : 'linha-' + (i + 1);
      while (usados.has(id)) id += '~';
      usados.add(id);
      const v = {};
      l.forEach((x, j) => { if (String(x ?? '') !== '') v['c' + cab.indexOf(t.cab[j])] = String(x); });
      ops.push([fs.doc(fs.collection(ref, 'pessoas'), id), { o: i, v }]);
    });
    qs.linhas.forEach((l, i) => ops.push([fs.doc(fs.collection(ref, 'quartos'), idDoc(l[0])), { o: i, v: Object.fromEntries(l.map((x, j) => ['c' + j, String(x ?? '')])) }]));
    await Nuvem.gravarEmLotes(ops);
    return codigo;
  },

  // Planilha nova do site de ingressos → atualiza o evento sem perder o que a recepção fez.
  async importar(t) {
    if (!navigator.onLine) throw new Error('Precisa de internet para importar.');
    await comTempo(Nuvem.ouvir(cfg.ev), 20000, 'Sem conexão com o banco.');
    const { fs } = Nuvem.fb;
    const E = Nuvem.estado;
    const ref = Nuvem.evRef();
    const cab0 = (E.ev && E.ev.cabPessoas) || [];
    const cab = [...cab0];
    // Coluna do arquivo → coluna do evento: mesmo nome, ou o mesmo campo reconhecido (ex.: "Nome" ↔ "Participante").
    const mE = mapear(cab0), mA = mapear(t.cab);
    const destino = t.cab.map((h, j) => {
      if (cab.includes(h)) return h;
      const k = CAMPOS.find((c) => mA[c.k] === j && mE[c.k] >= 0);
      if (k) return cab0[mE[k.k]];
      cab.push(h);
      return h;
    });
    if (cab.length !== cab0.length) await comTempo(fs.updateDoc(ref, { cabPessoas: cab }), 30000, 'Sem conexão com o banco.');
    const fi = destino.map((h) => cab.indexOf(h));
    const kCod = mE.codigo >= 0 ? mE.codigo : cab.findIndex((h) => norm(h) === 'codigo');
    const kNome = mE.nome >= 0 ? mE.nome : mE.comprador;
    const kUsado = mE.usado, kStatus = mE.status;
    // Chaves de uma linha: código do ingresso e nome. Casa pelo código; se não houver, pelo nome.
    const chaves = (get) => {
      const c = kCod >= 0 ? String(get(kCod) ?? '').trim() : '';
      const n = kNome >= 0 ? norm(get(kNome)) : '';
      return [c && 'c:' + c, n && 'n:' + n].filter(Boolean);
    };
    const existentes = new Map();
    const mapaExist = { get: (ks) => { for (const k of ks) if (existentes.has(k)) return existentes.get(k); return null; } };
    let maxO = 0;
    for (const [id, d] of E.pessoas) {
      const v = d.v || {};
      for (const k of chaves((i) => v['c' + i])) if (!existentes.has(k)) existentes.set(k, [id, v]);
      maxO = Math.max(maxO, Number(d.o) || 0);
    }
    const chave = chaves;
    const sis = new Set(Object.values(SIS).map((c) => cab.indexOf(c)));
    const ops = [];
    let novos = 0, atualizados = 0;
    const usados = new Set(E.pessoas.keys());
    t.linhas.forEach((l) => {
      const k = chave((i) => { const j = fi.indexOf(i); return j >= 0 ? l[j] : ''; });
      const ex = k.length && mapaExist.get(k);
      if (ex) {
        const [id, v] = ex;
        const vv = {};
        l.forEach((x, j) => {
          const i = fi[j];
          if (sis.has(i)) return; // colunas da recepção: nunca sobrescreve
          const atual = String(v['c' + i] ?? '');
          const novo = String(x ?? '');
          if (!novo && atual) return; // arquivo sem o dado: mantém o que já tinha
          if (i === kUsado && norm(atual) === 'usado') return;
          if (i === kStatus && /^(pago|aprovado)/.test(norm(atual)) && !/^(pago|aprovado)/.test(norm(novo))) return;
          if (novo !== atual) vv['c' + i] = novo;
        });
        if (Object.keys(vv).length) { ops.push([fs.doc(fs.collection(ref, 'pessoas'), id), { v: vv }, true]); atualizados++; }
      } else {
        const cod = kCod >= 0 && fi.indexOf(kCod) >= 0 ? l[fi.indexOf(kCod)] : '';
        let id = cod ? idDoc(cod) : 'linha-' + Date.now().toString(36) + '-' + novos;
        while (usados.has(id)) id += '~';
        usados.add(id);
        const v = {};
        l.forEach((x, j) => { if (String(x ?? '') !== '' && !sis.has(fi[j])) v['c' + fi[j]] = String(x); });
        ops.push([fs.doc(fs.collection(ref, 'pessoas'), id), { o: maxO + 1 + novos, v }]);
        k.forEach((x) => { if (!existentes.has(x)) existentes.set(x, [id, v]); });
        novos++;
      }
    });
    await Nuvem.gravarEmLotes(ops);
    return { novos, atualizados, total: t.linhas.length };
  },

  async sair() {
    Nuvem.parar();
    if (Nuvem.fb) {
      try { await Nuvem.fb.fs.terminate(Nuvem.db); await Nuvem.fb.fs.clearIndexedDbPersistence(Nuvem.db); } catch { /* segue */ }
    }
  },
};

/* --- telas do evento --- */
async function perguntarAparelho(titulo, texto, botao) {
  const r = await folha({
    titulo,
    corpo: `${texto}<div class="form"><label class="campo">Seu nome / nome deste aparelho <span class="muted" style="font-weight:400">aparece na planilha em cada check-in</span>
      <input name="atendente" value="${esc(cfg.atendente)}" placeholder="Ex.: Mesa 1 — Ana"></label></div>`,
    botoes: [{ v: 'ok', t: botao, cls: 'primario' }],
    ler: (f) => ({ atendente: f.atendente.value.trim() }),
  });
  return r && r.dados;
}

async function entrarEvento(texto, { perguntar = true } = {}) {
  const codigo = normCodigo(texto);
  if (!codigo) {
    const s = String(texto || '');
    if (/#conectar=/.test(s)) { conectarComLink(s); return; }
    if (/docs\.google\.com\/spreadsheets|drive\.google\.com/i.test(s)) { st.guia = { tipo: 'planilha', url: s.match(/https?:\/\/\S+/)?.[0] || '' }; irPara('ajustes'); renderAjustes(); return; }
    toast(s.trim() ? 'Código inválido. Ele tem 16 letras/números, como ABCD-EFGH-JKLM-NPQR.' : 'Digite o código do evento.', 'erro');
    return;
  }
  if (location.hash.startsWith('#evento=')) history.replaceState(null, '', location.pathname + '#recepcao');
  if (perguntar) {
    const r = await perguntarAparelho('Entrar no evento', `<p>Entrar no evento <b>${esc(codigo)}</b> neste aparelho?</p>`, 'Entrar');
    if (!r) { renderizar(); return; }
    cfg.atendente = r.atendente;
  }
  Object.assign(cfg, { ev: codigo, demo: false, local: false, url: '', chave: '', planilha: '', aba: '', mapa: {} });
  salvarCfg();
  st.base = null; st.fila = []; salvarFila(); st.guia = null; st.erro = null; localStorage.removeItem(K.cache);
  await recarregar();
  if (st.base) { comemorar('Você entrou no evento!'); irPara('recepcao'); }
  else if (!st.offline) { Nuvem.parar(); cfg.ev = ''; salvarCfg(); renderizar(); }
}

async function criarEventoComArquivo(file) {
  let t;
  try { t = await Arq.ler(file); } catch (e) { toast(e.message || 'Não consegui ler esse arquivo.', 'erro'); return; }
  const m = mapear(t.cab);
  if (m.nome < 0 && m.comprador < 0 && m.codigo < 0) { toast('Não achei as colunas de nome ou código nesse arquivo. É a planilha de inscritos?', 'erro'); return; }
  const r = await folha({
    titulo: 'Criar evento',
    corpo: `<p>A planilha <b>${esc(file.name)}</b> tem <b>${t.linhas.length}</b> inscritos. Eles vão para o banco e a equipe entra com o código do evento.</p>
      <div class="form">
        <label class="campo">Nome do evento<input name="nome" value="${esc(cfg.evento || 'Encontro com Deus')}"></label>
        <label class="campo">Seu nome / nome deste aparelho<input name="atendente" value="${esc(cfg.atendente)}" placeholder="Ex.: Coordenação — Victor"></label>
      </div>`,
    botoes: [{ v: 'ok', t: 'Criar evento', cls: 'primario' }],
    ler: (f) => ({ nome: f.nome.value.trim() || 'Encontro com Deus', atendente: f.atendente.value.trim() }),
  });
  if (!r) return;
  toast('Enviando a planilha para o banco…');
  girar(true);
  let codigo;
  try { codigo = await Nuvem.criarEvento(r.dados.nome, t); }
  catch (e) { toast('Não deu para criar o evento: ' + e.message, 'erro'); return; }
  finally { girar(false); }
  Object.assign(cfg, { ev: codigo, evento: r.dados.nome, atendente: r.dados.atendente, demo: false, local: false, url: '', chave: '', planilha: '', aba: '', mapa: {} });
  salvarCfg();
  st.base = null; st.fila = []; salvarFila(); st.guia = null; localStorage.removeItem(K.cache);
  await recarregar();
  comemorar('Evento criado!');
  irPara('ajustes');
  setTimeout(() => mostrarCodigo(true), 900);
}

async function importarNoEvento(file) {
  let t;
  try { t = await Arq.ler(file); } catch (e) { toast(e.message || 'Não consegui ler esse arquivo.', 'erro'); return; }
  if (!await confirmar('Atualizar inscritos',
    `<p>O arquivo <b>${esc(file.name)}</b> tem <b>${t.linhas.length}</b> registros.</p>
     <p>Quem é novo entra no evento; quem já existe tem os dados do site atualizados. <b>Check-ins, pagamentos na recepção, quartos e cadastros feitos na recepção não são alterados.</b></p>`,
    'Atualizar', 'primario')) return;
  girar(true);
  try {
    const r = await Nuvem.importar(t);
    toast(`${r.novos} novo(s) · ${r.atualizados} atualizado(s) · ${r.total - r.novos - r.atualizados} sem mudança.`, 'ok');
  } catch (e) { toast('Não deu para importar: ' + e.message, 'erro'); }
  finally { girar(false); }
}

const linkEvento = () => SITE + '#evento=' + cfg.ev;

async function mostrarCodigo(novo = false) {
  const r = await folha({
    titulo: novo ? 'Evento criado! Envie para a equipe' : 'Acesso da equipe',
    corpo: `<p>Quem tiver este código entra no evento pelo site e trabalha junto, ao vivo:</p>
      <div class="codigo-evento"><b>${esc(cfg.ev)}</b></div>
      <p class="muted peq">Site: ${esc(SITE)}<br>O código dá acesso aos dados dos inscritos (telefones e saúde). Envie só para a equipe.</p>`,
    botoes: [{ v: 'copiar', t: 'Copiar código' }, { v: 'enviar', t: 'Enviar link', cls: 'primario' }],
  });
  const texto = `Recepção do ${cfg.evento || st.planilha || 'Encontro com Deus'}: abra no celular ${linkEvento()} (código do evento: ${cfg.ev})`;
  if (r === 'enviar') {
    if (navigator.share) { try { await navigator.share({ title: 'Acesso à recepção', text: texto }); } catch { /* cancelado */ } }
    else { try { await navigator.clipboard.writeText(texto); toast('Mensagem copiada. Cole no WhatsApp da equipe.', 'ok'); } catch { prompt('Copie:', texto); } }
  } else if (r === 'copiar') {
    try { await navigator.clipboard.writeText(cfg.ev); toast('Código copiado.', 'ok'); } catch { prompt('Copie o código:', cfg.ev); }
  }
}

function cartaoEvento() {
  const pend = Nuvem.pendente();
  return `<div class="cartao">
    <div class="estado">
      <div class="bola ${st.erro ? 'erro' : ''}"><svg viewBox="0 0 24 24">${st.erro ? '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>' : '<path d="M5 12.5l4.5 4.5L19 7.5"/>'}</svg></div>
      <div style="min-width:0"><b>${esc(st.planilha || cfg.evento || 'Evento')}</b>
        <div class="muted peq">${st.erro ? esc(st.erro) : st.base ? `${st.pessoas.length} inscritos · ${!navigator.onLine ? 'sem internet, guardando no aparelho' : pend ? 'enviando…' : 'ao vivo com a equipe'}` : 'Carregando…'}</div></div>
    </div>
    <button class="codigo-evento" data-acao="mostrarCodigo" title="Mostrar código">Código do evento <b>${esc(cfg.ev)}</b></button>
    <div class="form" style="margin-top:12px">
      <button class="btn primario bloco" data-acao="mostrarCodigo">Enviar acesso para a equipe</button>
      <button class="btn bloco" data-acao="importarEvento">📂 Atualizar inscritos com planilha nova</button>
      <button class="btn bloco" data-acao="baixarPlanilha">⬇ Baixar planilha (.xlsx)</button>
    </div>
  </div>`;
}

/* ================= modo demonstração ================= */
const Demo = {
  carregar() {
    if (cfg.local) { const l = ler(K.local, null); if (!l) throw new Error('Nenhum arquivo aberto neste aparelho. Vá em Ajustes → Abrir arquivo.'); return l; }
    const d = ler(K.demo, null);
    if (d && (d.cab || d.abas)) return d;
    const n = Demo.gerar();
    gravarLS(K.demo, n);
    return n;
  },
  gerar() {
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const femininos = ['Ana', 'Carla', 'Elaine', 'Gabriela', 'Isabela', 'Karen', 'Mariana', 'Olívia', 'Rafaela', 'Tatiane', 'Yasmin', 'Letícia'];
    const masculinos = ['Bruno', 'Daniel', 'Fábio', 'Henrique', 'João', 'Lucas', 'Nelson', 'Paulo', 'Samuel', 'Vinícius', 'Rodrigo', 'Mateus'];
    const sobren = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Ferreira', 'Ribeiro'];
    const lideres = ['Marcos Teixeira', 'marcos teixeira ', 'Priscila Rocha', 'Renato Dias', 'Renato dias', 'Simone Prado', 'Tiago Mendes'];
    const discs = ['Pr. Eduardo Moura', 'Eduardo Moura', 'Cláudia Reis', 'claudia reis', 'Roberto Faria'];
    const cab = ['Usado', 'Código', 'Comprador', 'E-mail do comprador', 'Celular do comprador', 'Tipo', 'Data da Compra', 'Status', 'Método de pagamento', 'Preço do Ingresso',
      'Nome Completo', 'Data de Nascimento', 'Sexo', 'Celular', 'Qual o nome do seu discipulador?', 'Qual é o nome do(a) líder de sua célula?',
      'Já foi batizado numa igreja evangélica?', 'Essa é a sua primeira vez no Encontro com Deus?', 'Você faz uso de algum medicamento contínuo? Se sim, qual?',
      'Tem alguma alergia? Se sim, qual?', 'Possui alguma restrição alimentar? Se sim, qual', 'Contato de emergência (Nome e Telefone)'];
    const linhas = [];
    for (let i = 0; i < 80; i++) {
      const fem = rnd() < 0.5;
      const nome = `${pick(fem ? femininos : masculinos)} ${pick(sobren)} ${pick(sobren)}`;
      const tipo = i < 45 ? 'Encontrista | LOTE 1' : i < 72 ? 'Equipe | LOTE 1' : 'Anjo | LOTE 1';
      const r = rnd();
      const status = r < 0.12 ? 'Pendente' : 'Pago';
      const metodo = status === 'Pendente' ? 'PIX' : r < 0.7 ? 'PIX' : r < 0.93 ? 'Cartão de crédito' : 'Externo (Manual)';
      const cel = `+55659${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}`;
      linhas.push(['Não Usado', Math.floor(rnd() * 0xfffff).toString(16).padStart(5, '0'), nome, 'exemplo' + i + '@exemplo.com', cel, tipo,
        `0${1 + (i % 5)}/06/2026 1${i % 10}:${String(i % 60).padStart(2, '0')}`, status, metodo, metodo.startsWith('Externo') ? '' : '145',
        nome, `${String(1 + (i % 28)).padStart(2, '0')}/0${1 + (i % 9)}/19${70 + (i % 30)}`, fem ? 'Feminino' : 'Masculino', cel,
        pick(discs), pick(lideres),
        rnd() < 0.65 ? 'Sim, ja fui batizado em uma igreja evangélica' : 'Não sou batizado em igreja evangélica',
        i < 45 ? 'Sim, é minha primeira vez' : 'Não, eu ja fui em outro encontro',
        rnd() < 0.85 ? 'Não' : 'Losartana', rnd() < 0.85 ? 'Não' : 'Dipirona', rnd() < 0.9 ? 'Não' : 'Lactose', 'Contato Exemplo 65 90000-0000']);
    }
    return { planilha: 'Demonstração (dados fictícios)', aba: 'Ingressos', cab, linhas };
  },
  // Simula a planilha com várias abas: { planilha, aba (principal), abas: { nome: { cab, linhas } } }
  async api(acao, p) {
    if (cfg.demo) await new Promise((r) => setTimeout(r, 120));
    const d = Demo.carregar();
    if (!d.abas) { d.abas = { [d.aba]: { cab: d.cab, linhas: d.linhas } }; delete d.cab; delete d.linhas; }
    const chave = cfg.local ? K.local : K.demo;
    const salvar = () => { try { localStorage.setItem(chave, JSON.stringify(d)); } catch { throw new Error('Memória do navegador cheia.'); } };
    if (acao === 'garantirAba') {
      if (!d.abas[p.nome]) { d.abas[p.nome] = { cab: [...p.cabecalho], linhas: p.linhas.map((l) => l.map(String)) }; salvar(); }
      return { ok: true };
    }
    const t = d.abas[p.aba || d.aba];
    if (!t) throw new Error(`Aba "${p.aba}" não encontrada.`);
    if (acao === 'ler') {
      const outras = {};
      for (const nome of p.extras || []) outras[nome] = d.abas[nome] ? { cabecalho: [...d.abas[nome].cab], linhas: d.abas[nome].linhas.map((l) => [...l]) } : null;
      return { ok: true, planilha: d.planilha, aba: d.aba, abas: Object.keys(d.abas), cabecalho: [...t.cab], linhas: t.linhas.map((l) => [...l]), outras };
    }
    if (acao === 'garantirColunas') { garantirEm(t.cab, t.linhas, p.colunas); salvar(); return { ok: true }; }
    if (acao === 'atualizar') {
      const ci = t.cab.indexOf(p.chaveColuna);
      const li = ci >= 0 && p.chaveValor ? t.linhas.findIndex((l) => l[ci] === p.chaveValor) : p.linha - 2;
      if (li < 0 || !t.linhas[li]) throw new Error('Registro não encontrado.');
      atualizarEm(t.cab, t.linhas, p);
    } else if (acao === 'atualizarVarios') {
      p.itens.forEach((it) => atualizarEm(t.cab, t.linhas, { chaveColuna: p.chaveColuna, ...it }));
    } else if (acao === 'inserir') {
      const v = p.valores || {};
      garantirEm(t.cab, t.linhas, Object.keys(v));
      const ci = t.cab.indexOf(p.chaveColuna);
      if (!(ci >= 0 && t.linhas.some((l) => l[ci] === v[p.chaveColuna]))) t.linhas.push(t.cab.map((h) => String(v[h] ?? '')));
    } else throw new Error('Ação desconhecida: ' + acao);
    salvar();
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
  if (configurado() && !semNuvem() && cache && cache.url === (cfg.ev || cfg.url) && cache.cabecalho) {
    usarBase(cache);
    st.carregadoEm = cache.em ? new Date(cache.em) : null;
  }
  renderizar();
  if (location.hash.startsWith('#conectar=')) { conectarComLink(location.hash); return; }
  if (location.hash.startsWith('#evento=')) { entrarEvento(location.hash); return; }
  if (configurado()) recarregar({ silencioso: !!st.base });
  console.info('Encontro com Deus v' + VERSAO);
})();
