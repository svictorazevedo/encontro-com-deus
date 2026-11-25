/* Encontro com Deus — Painel e Recepção
 * Site estático (GitHub Pages). Banco = planilha Google, acessada via Apps Script (apps-script/Codigo.gs).
 */
'use strict';

const VERSAO = '1.0.0';
const CFG_KEY = 'encontro.cfg.v1';
const DEMO_KEY = 'encontro.demo.v1';

/* ---------- utilitários ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
const agora = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const titulo = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  .split(' ').map((w, i) => (i && MINUSCULAS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const fmtCel = (s) => {
  let d = soDigitos(s);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(s ?? '').trim();
};
const brl = (v) => {
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v);
};

/* ---------- configuração ---------- */
const PADRAO = {
  url: '', planilha: '', aba: '', chave: '', atendente: '', evento: '',
  valorPadrao: '145', metodosRecepcao: 'Externo, Manual, Dinheiro', mapa: {}, demo: false,
};
let cfg = carregarCfg();
function carregarCfg() {
  try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; } catch { return { ...PADRAO }; }
}
function salvarCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
const configurado = () => cfg.demo || (cfg.url && cfg.planilha && cfg.chave);

/* Campos que o sistema entende e como reconhecê-los pelo cabeçalho */
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
/* Colunas de controle criadas pelo sistema no fim da planilha */
const SIS = {
  checkin: 'Check-in',
  checkinEm: 'Check-in em',
  checkinPor: 'Check-in por',
  pagoRec: 'Pago na recepção',
  valorRec: 'Valor recepção',
  pagoRecEm: 'Pago na recepção em',
  cadastroPor: 'Cadastrado na recepção por',
};
const CATS = { encontrista: 'Encontrista', equipe: 'Equipe', anjo: 'Anjo', outro: 'Outro' };
const METODOS_REC = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito'];

/* ---------- estado ---------- */
const st = {
  cab: [], linhas: [], pessoas: [], abas: [], planilha: '', aba: '', idx: {}, carregadoEm: null,
  filtro: 'todos', busca: '', filtroGrupo: 'todos', abertos: new Set(), erro: null,
};

/* ---------- acesso aos dados ---------- */
async function api(acao, dados = {}) {
  if (cfg.demo) return Demo.api(acao, dados);
  if (!cfg.url) throw new Error('Configure a URL do Apps Script na tela de Configuração.');
  const corpo = JSON.stringify({ acao, chave: cfg.chave, planilha: cfg.planilha, aba: cfg.aba, ...dados });
  let r;
  try {
    // text/plain evita a verificação CORS (preflight), que o Apps Script não responde.
    r = await fetch(cfg.url, { method: 'POST', body: corpo, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  } catch {
    throw new Error('Sem conexão com o Apps Script. Verifique a internet e a URL (deve terminar em /exec).');
  }
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch {
    throw new Error('Resposta inesperada do Apps Script. Confira se a implantação é "App da Web" com acesso "Qualquer pessoa".');
  }
  if (!j.ok) throw new Error(j.erro || 'Erro desconhecido.');
  return j;
}

function mapear(cab) {
  const nc = cab.map(norm);
  const idx = {};
  for (const c of CAMPOS) {
    const escolhido = cfg.mapa[c.k];
    if (escolhido === '-') { idx[c.k] = -1; continue; }
    let i = escolhido ? cab.indexOf(escolhido) : -1;
    if (i < 0) i = nc.findIndex((h, j) => c.re.test(h) && !Object.values(idx).includes(j) && !Object.values(SIS).includes(cab[j]));
    idx[c.k] = i;
  }
  for (const [k, nome] of Object.entries(SIS)) idx['sis_' + k] = cab.indexOf(nome);
  return idx;
}
const colNome = (k) => (st.idx[k] >= 0 ? st.cab[st.idx[k]] : null);

function metodoEhRecepcao(m) {
  const n = norm(m);
  if (!n) return false;
  return cfg.metodosRecepcao.split(',').map(norm).filter(Boolean).some((t) => n.includes(t));
}

function montarPessoa(linha, i) {
  const g = (k) => { const j = st.idx[k]; return j >= 0 ? String(linha[j] ?? '').trim() : ''; };
  const nome = g('nome') || g('comprador');
  const codigo = g('codigo');
  if (!nome && !codigo) return null;
  const tipo = g('tipo');
  const nt = norm(tipo);
  const cat = nt.includes('anjo') ? 'anjo' : nt.includes('equipe') ? 'equipe' : nt.includes('encontrist') ? 'encontrista' : 'outro';
  const status = g('status');
  const ns = norm(status);
  const cancelado = /cancel|estorn|reembols|recusad|expirad|devolvid/.test(ns);
  const metodo = g('metodo');
  const pagoRecCol = g('sis_pagoRec');
  const pagoStatus = /^(pago|aprovado|confirmado|concluido|pago manual)/.test(ns);
  const pagoRec = !!pagoRecCol || (pagoStatus && metodoEhRecepcao(metodo));
  const pago = !cancelado && (pagoStatus || !!pagoRecCol);
  const nb = norm(g('batizado'));
  const batizado = /^sim/.test(nb) ? 'sim' : /^nao|nao sou/.test(nb) ? 'nao' : '';
  const checkin = /^sim/.test(norm(g('sis_checkin'))) || norm(g('usado')) === 'usado';
  return {
    linha: i + 2, codigo, nome, cat, tipo, status, metodo, cancelado,
    pago, pagoRec: pago && pagoRec, pagoApp: pago && !pagoRec,
    batizado, checkin,
    checkinEm: g('sis_checkinEm'), checkinPor: g('sis_checkinPor'),
    valorRec: g('sis_valorRec'), pagoRecEm: g('sis_pagoRecEm'), metodoRec: pagoRecCol,
    preco: g('preco'), celular: g('celular') || g('celularComprador'), comprador: g('comprador'),
    lider: g('lider'), discipulador: g('discipulador'), sexo: g('sexo'), nascimento: g('nascimento'),
    medicamento: g('medicamento'), alergia: g('alergia'), restricao: g('restricao'), emergencia: g('emergencia'),
    locomocao: g('locomocao'), primeiraVez: g('primeiraVez'), igreja: g('igreja'),
    busca: norm([nome, g('comprador'), codigo, g('lider'), g('discipulador')].join(' ')) + ' ' + soDigitos(g('celular') + ' ' + g('celularComprador')),
  };
}

async function recarregar({ silencioso = false } = {}) {
  if (!configurado()) return;
  if (!silencioso) carregando(true, 'Lendo a planilha…');
  try {
    const r = await api('ler');
    st.cab = r.cabecalho || [];
    st.linhas = r.linhas || [];
    st.abas = r.abas || [];
    st.planilha = r.planilha || '';
    st.aba = r.aba || '';
    st.idx = mapear(st.cab);
    st.pessoas = st.linhas.map(montarPessoa).filter(Boolean);
    st.carregadoEm = new Date();
    st.erro = null;
  } catch (e) {
    st.erro = e.message;
    if (!silencioso) toast(e.message, 'erro');
  } finally {
    if (!silencioso) carregando(false);
  }
  renderizar();
}

async function gravar(acao, dados, msgOk) {
  carregando(true, 'Gravando na planilha…');
  try {
    await api(acao, dados);
    if (msgOk) toast(msgOk, 'ok');
    await recarregar({ silencioso: true });
    return true;
  } catch (e) {
    toast(e.message, 'erro');
    return false;
  } finally {
    carregando(false);
  }
}

function atualizarPessoa(p, valores, msg) {
  return gravar('atualizar', { linha: p.linha, chaveColuna: p.codigo ? colNome('codigo') : '', chaveValor: p.codigo, valores }, msg);
}

/* ---------- ações da recepção ---------- */
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
const acharPessoa = (linha) => st.pessoas.find((p) => p.linha === Number(linha));

async function fazerCheckin(p) {
  if (!p.pago && !p.cancelado) {
    const escolha = await modal({
      titulo: 'Pagamento pendente',
      corpo: `<p><strong>${esc(p.nome)}</strong> ainda não está paga(o) (status: ${esc(p.status || '—')}).</p>
              <p class="muted">Você pode receber o pagamento agora e já registrar a presença.</p>`,
      botoes: [
        { v: 'pagar', t: 'Receber pagamento e fazer check-in', cls: 'primario' },
        { v: 'so', t: 'Fazer check-in sem pagamento' },
      ],
    });
    if (escolha === 'pagar') return receberPagamento(p, true);
    if (escolha !== 'so') return;
  }
  await atualizarPessoa(p, valoresCheckin(true), `Check-in de ${p.nome} registrado.`);
}

async function desfazerCheckin(p) {
  const r = await modal({
    titulo: 'Desfazer check-in',
    corpo: `<p>Remover a presença de <strong>${esc(p.nome)}</strong>?</p>`,
    botoes: [{ v: 'sim', t: 'Desfazer', cls: 'perigo' }],
  });
  if (r === 'sim') await atualizarPessoa(p, valoresCheckin(false), 'Check-in desfeito.');
}

async function receberPagamento(p, comCheckin = false) {
  const r = await modal({
    titulo: 'Receber pagamento na recepção',
    corpo: `<p><strong>${esc(p.nome)}</strong> · ${esc(CATS[p.cat])}</p>
      <div class="grade-form">
        <label>Forma de pagamento
          <select name="metodo">${METODOS_REC.map((m) => `<option>${m}</option>`).join('')}</select>
        </label>
        <label>Valor (R$)<input name="valor" inputmode="decimal" value="${esc(p.preco || cfg.valorPadrao)}"></label>
        <label class="check col-3"><input type="checkbox" name="checkin" ${comCheckin || !p.checkin ? 'checked' : ''} ${p.checkin ? 'disabled' : ''}>
          ${p.checkin ? 'Já fez check-in' : 'Fazer check-in junto'}</label>
      </div>`,
    botoes: [{ v: 'ok', t: 'Confirmar pagamento', cls: 'ok' }],
    ler: (f) => ({ metodo: f.metodo.value, valor: f.valor.value.trim(), checkin: f.checkin.checked && !f.checkin.disabled }),
  });
  if (!r || r.v !== 'ok') return;
  const valores = valoresPagamento(r.dados.metodo, r.dados.valor);
  if (r.dados.checkin) Object.assign(valores, valoresCheckin(true));
  await atualizarPessoa(p, valores, `Pagamento de ${p.nome} registrado${r.dados.checkin ? ' + check-in' : ''}.`);
}

async function estornarPagamentoRecepcao(p) {
  const r = await modal({
    titulo: 'Desfazer pagamento da recepção',
    corpo: `<p>Remover o pagamento registrado na recepção para <strong>${esc(p.nome)}</strong>?</p>`,
    botoes: [{ v: 'sim', t: 'Desfazer pagamento', cls: 'perigo' }],
  });
  if (r !== 'sim') return;
  const v = { [SIS.pagoRec]: '', [SIS.valorRec]: '', [SIS.pagoRecEm]: '' };
  const s = colNome('status');
  if (s) v[s] = 'Pendente';
  await atualizarPessoa(p, v, 'Pagamento desfeito.');
}

function opcoesNomes(k) {
  const vistos = new Map();
  for (const p of st.pessoas) { const n = p[k]; if (n && !vistos.has(norm(n))) vistos.set(norm(n), titulo(n)); }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((n) => `<option value="${esc(n)}">`).join('');
}

async function novoCadastro() {
  if (!configurado()) return irPara('config');
  const r = await modal({
    titulo: 'Cadastrar encontrista / equipe',
    corpo: `
      <div class="grade-form">
        <label class="col-2">Nome completo *<input name="nome" required autocomplete="off"></label>
        <label>Tipo *
          <select name="cat"><option value="encontrista">Encontrista</option><option value="equipe">Equipe</option><option value="anjo">Anjo</option></select>
        </label>
        <label>Sexo<select name="sexo"><option value=""></option><option>Masculino</option><option>Feminino</option></select></label>
        <label>Data de nascimento<input name="nascimento" type="date"></label>
        <label>Celular<input name="celular" inputmode="tel" placeholder="(65) 99999-9999"></label>
        <label>Discipulador(a)<input name="discipulador" list="dlDisc" autocomplete="off"></label>
        <label>Líder de célula<input name="lider" list="dlLider" autocomplete="off"></label>
        <label>Já é batizado(a)?<select name="batizado"><option value=""></option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
        <label>Primeira vez no Encontro?<select name="primeira"><option value=""></option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
        <label class="col-2">Contato de emergência (nome e telefone)<input name="emergencia"></label>
        <label>Medicamento contínuo<input name="medicamento"></label>
        <label>Alergia<input name="alergia"></label>
        <label>Restrição alimentar<input name="restricao"></label>
        <fieldset class="col-3">
          <legend>Pagamento</legend>
          <div class="grade-form">
            <label>Situação
              <select name="pagamento"><option value="">Não pago (pendente)</option>${METODOS_REC.map((m) => `<option>${m}</option>`).join('')}</select>
            </label>
            <label>Valor (R$)<input name="valor" inputmode="decimal" value="${esc(cfg.valorPadrao)}"></label>
            <label class="check"><input type="checkbox" name="checkin" checked> Já fazer check-in</label>
          </div>
        </fieldset>
      </div>
      <datalist id="dlDisc">${opcoesNomes('discipulador')}</datalist>
      <datalist id="dlLider">${opcoesNomes('lider')}</datalist>`,
    botoes: [{ v: 'ok', t: 'Cadastrar', cls: 'primario' }],
    ler: (f) => Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()]).concat([['checkin', f.checkin.checked]])),
    validar: (d) => (d.nome ? '' : 'Informe o nome.'),
  });
  if (!r || r.v !== 'ok') return;
  const d = r.dados;
  const nome = titulo(d.nome);
  const dup = st.pessoas.find((p) => norm(p.nome) === norm(nome));
  if (dup) {
    const c = await modal({
      titulo: 'Possível duplicidade',
      corpo: `<p>Já existe <strong>${esc(dup.nome)}</strong> (${esc(CATS[dup.cat])}, código ${esc(dup.codigo || '—')}). Cadastrar mesmo assim?</p>`,
      botoes: [{ v: 'sim', t: 'Cadastrar mesmo assim', cls: 'primario' }],
    });
    if (c !== 'sim') return;
  }
  const col = (k) => colNome(k) || CAMPOS.find((c) => c.k === k).nome;
  const codigo = 'R' + Math.random().toString(16).slice(2, 7);
  const nasc = d.nascimento ? d.nascimento.split('-').reverse().join('/') : '';
  const v = {
    [col('codigo')]: codigo,
    [col('nome')]: nome,
    [col('tipo')]: `${CATS[d.cat]} | Recepção`,
    [col('status')]: d.pagamento ? 'Pago' : 'Pendente',
    [col('dataCompra')]: agora(),
    [col('celular')]: d.celular,
    [col('sexo')]: d.sexo,
    [col('nascimento')]: nasc,
    [col('discipulador')]: d.discipulador,
    [col('lider')]: d.lider,
    [col('batizado')]: d.batizado === 'sim' ? 'Sim, ja fui batizado em uma igreja evangélica' : d.batizado === 'nao' ? 'Não sou batizado em igreja evangélica' : '',
    [col('primeiraVez')]: d.primeira === 'sim' ? 'Sim, é minha primeira vez' : d.primeira === 'nao' ? 'Não, já fui em outro Encontro' : '',
    [col('medicamento')]: d.medicamento,
    [col('alergia')]: d.alergia,
    [col('restricao')]: d.restricao,
    [col('emergencia')]: d.emergencia,
    [SIS.cadastroPor]: cfg.atendente || 'Recepção',
  };
  if (colNome('comprador')) v[colNome('comprador')] = nome;
  if (colNome('usado')) v[colNome('usado')] = 'Não Usado';
  if (d.pagamento) {
    Object.assign(v, valoresPagamento(d.pagamento, d.valor));
    v[col('metodo')] = `${d.pagamento} (recepção)`;
    v[col('preco')] = d.valor;
  }
  if (d.checkin) Object.assign(v, valoresCheckin(true));
  const ok = await gravar('inserir', { valores: v, chaveColuna: col('codigo') }, `${nome} cadastrado(a)${d.checkin ? ' com check-in' : ''}.`);
  if (ok) { st.busca = nome; $('#busca').value = nome; renderRecepcao(); }
}

/* ---------- painel ---------- */
// Agrupa variações do mesmo nome: acentos, maiúsculas, espaços e títulos (Pr., Pra., Obr., Pastor…)
const TITULOS = /^(pr|pra|pastor|pastora|obr|obra|obreiro|obreira|ap|apostolo|apostola|bispo|bispa|ev|evangelista|miss|missionario|missionaria|dc|diacono|diaconisa|lider)\s+/;
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
    return { nome: g.chave === '~' ? '(não informado)' : titulo(melhor[0]), vazio: g.chave === '~', pessoas: g.pessoas };
  }).sort((a, b) => (a.vazio - b.vazio) || (b.pessoas.length - a.pessoas.length) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function tabelaGrupo(tituloTxt, grupos, total) {
  const max = Math.max(1, ...grupos.map((g) => g.pessoas.length));
  const linhas = grupos.map((g) => {
    const n = g.pessoas.length;
    const c = (cat) => g.pessoas.filter((p) => p.cat === cat).length;
    const det = [['encontrista', 'enc.'], ['equipe', 'eq.'], ['anjo', 'anjo']].map(([k, r]) => (c(k) ? `${c(k)} ${r}` : '')).filter(Boolean).join(' · ');
    return `<tr><td>
      <details class="grupo"><summary><strong>${esc(g.nome)}</strong> <span class="muted">${det ? '· ' + det : ''}</span>
        <div class="barra-h"><span style="width:${(n / max) * 100}%"></span></div></summary>
        <div class="nomes">${g.pessoas.map((p) => esc(p.nome)).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')}</div>
      </details></td><td class="num"><strong>${n}</strong></td></tr>`;
  }).join('');
  return `<div class="cartao">
    <div class="cab-tabela"><h2>${esc(tituloTxt)}</h2><span class="muted">${grupos.filter((g) => !g.vazio).length} nomes · ${total} pessoas</span></div>
    <table><thead><tr><th>Nome (clique para ver as pessoas)</th><th class="num">Qtd.</th></tr></thead><tbody>${linhas || '<tr><td colspan="2" class="vazio">Sem dados</td></tr>'}</tbody></table>
  </div>`;
}

function kpi(rotulo, valor, det = '', cls = '') {
  return `<div class="kpi ${cls}"><div class="rotulo">${esc(rotulo)}</div><div class="valor">${valor}</div>${det ? `<div class="det">${det}</div>` : ''}</div>`;
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');

function renderPainel() {
  const el = $('#painelConteudo');
  if (!configurado()) { el.innerHTML = boasVindas(); return; }
  if (st.erro && !st.pessoas.length) { el.innerHTML = `<div class="aviso">${esc(st.erro)}</div>`; return; }
  const ativos = st.pessoas.filter((p) => !p.cancelado);
  const canc = st.pessoas.length - ativos.length;
  const n = (f) => ativos.filter(f).length;
  const tot = ativos.length;
  const enc = n((p) => p.cat === 'encontrista'), eq = n((p) => p.cat === 'equipe'), anj = n((p) => p.cat === 'anjo'), out = n((p) => p.cat === 'outro');
  const pagos = n((p) => p.pago), naoPagos = tot - pagos;
  const app = n((p) => p.pagoApp), rec = n((p) => p.pagoRec);
  const bat = n((p) => p.batizado === 'sim'), nbat = n((p) => p.batizado === 'nao'), sbat = tot - bat - nbat;
  const pres = n((p) => p.checkin);
  const totRec = ativos.filter((p) => p.pagoRec && p.valorRec).reduce((s, p) => s + (Number(String(p.valorRec).replace(',', '.')) || 0), 0);

  const lista = st.filtroGrupo === 'todos' ? ativos : ativos.filter((p) => p.cat === st.filtroGrupo);
  const naoPagosLista = ativos.filter((p) => !p.pago).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  el.innerHTML = `
    ${st.erro ? `<div class="aviso">Última atualização falhou: ${esc(st.erro)}</div>` : ''}
    <div class="grupo-titulo">Inscritos</div>
    <div class="kpis">
      ${kpi('Total de inscritos', tot, canc ? `${canc} cancelado(s) fora da conta` : '', 'pri')}
      ${kpi('Encontristas', enc, pct(enc, tot) + ' do total')}
      ${kpi('Equipe', eq, pct(eq, tot) + ' do total')}
      ${kpi('Anjos', anj, out ? `${out} sem tipo reconhecido` : pct(anj, tot) + ' do total')}
      ${kpi('Presentes (check-in)', `${pres}<span class="muted" style="font-size:1rem"> / ${tot}</span>`, pct(pres, tot), 'azul')}
    </div>
    <div class="grupo-titulo">Pagamento</div>
    <div class="kpis">
      ${kpi('Pagos', pagos, pct(pagos, tot), 'ok')}
      ${kpi('Não pagos', naoPagos, pct(naoPagos, tot), naoPagos ? 'erro' : '')}
      ${kpi('Pagos no app', app, pct(app, pagos) + ' dos pagos')}
      ${kpi('Pagos na recepção', rec, totRec ? brl(totRec) + ' recebidos' : pct(rec, pagos) + ' dos pagos')}
    </div>
    <div class="grupo-titulo">Batismo</div>
    <div class="kpis">
      ${kpi('Batizados', bat, pct(bat, tot))}
      ${kpi('Não batizados', nbat, pct(nbat, tot) + (sbat ? ` · ${sbat} sem resposta` : ''))}
    </div>

    <div class="cartao">
      <div class="cab-tabela"><h2>Não pagos (${naoPagosLista.length})</h2></div>
      ${naoPagosLista.length ? `<table><thead><tr><th>Nome</th><th>Tipo</th><th>Celular</th><th>Status</th><th></th></tr></thead><tbody>
        ${naoPagosLista.map((p) => `<tr><td><strong>${esc(p.nome)}</strong>${p.comprador && norm(p.comprador) !== norm(p.nome) ? `<div class="muted">comprador: ${esc(p.comprador)}</div>` : ''}</td>
          <td>${esc(CATS[p.cat])}</td><td>${esc(fmtCel(p.celular))}</td><td><span class="pill erro">${esc(p.status || 'Pendente')}</span></td>
          <td class="num"><button class="btn pequeno" data-acao="pagar" data-linha="${p.linha}">Receber</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="vazio">Todos pagos 🎉</div>'}
    </div>

    <div class="chips">
      <span class="muted" style="font-weight:600">Contar por líder e discipulado:</span>
      ${['todos', 'encontrista', 'equipe', 'anjo'].map((c) => `<button class="chip ${st.filtroGrupo === c ? 'ativo' : ''}" data-filtrogrupo="${c}">${c === 'todos' ? 'Todos' : CATS[c] + 's'}</button>`).join('')}
    </div>
    <div class="duas">
      ${tabelaGrupo('Por líder de célula', agrupar(lista, 'lider'), lista.length)}
      ${tabelaGrupo('Por discipulado', agrupar(lista, 'discipulador'), lista.length)}
    </div>`;
}

function boasVindas() {
  return `<div class="cartao"><h2>Bem-vindo(a)!</h2>
    <p>Para começar, conecte a planilha do Google Drive na tela de <a href="#config">Configuração</a>.</p>
    <div class="linha-botoes"><a class="btn primario" href="#config">Ir para Configuração</a>
    <button class="btn" data-acao="ativarDemo">Ver com dados de demonstração</button></div></div>`;
}

/* ---------- recepção ---------- */
function filtrarRecepcao() {
  const termo = norm(st.busca);
  const dig = soDigitos(st.busca);
  let l = st.pessoas;
  const f = st.filtro;
  if (f === 'semcheckin') l = l.filter((p) => !p.checkin && !p.cancelado);
  else if (f === 'presentes') l = l.filter((p) => p.checkin);
  else if (f === 'naopagos') l = l.filter((p) => !p.pago && !p.cancelado);
  else if (f.startsWith('cat:')) l = l.filter((p) => p.cat === f.slice(4));
  if (termo) {
    const partes = termo.split(' ');
    l = l.filter((p) => partes.every((t) => p.busca.includes(t)) || (dig.length >= 4 && p.busca.includes(dig)));
  }
  return [...l].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function seloPagamento(p) {
  if (p.cancelado) return `<span class="pill neutro">${esc(p.status)}</span>`;
  if (p.pagoRec) return `<span class="pill ok">Pago na recepção${p.metodoRec ? ' · ' + esc(p.metodoRec) : ''}</span>`;
  if (p.pago) return `<span class="pill ok">Pago no app${p.metodo ? ' · ' + esc(p.metodo) : ''}</span>`;
  return `<span class="pill erro">Não pago${p.status ? ' · ' + esc(p.status) : ''}</span>`;
}

function cartaoPessoa(p) {
  const aberto = st.abertos.has(p.linha);
  const info = [fmtCel(p.celular), p.lider && 'Líder: ' + titulo(p.lider), p.discipulador && 'Disc.: ' + titulo(p.discipulador)].filter(Boolean).map(esc).join(' · ');
  const extra = [
    ['Código', p.codigo], ['Tipo (planilha)', p.tipo], ['Sexo', p.sexo], ['Nascimento', p.nascimento],
    ['Batizado', p.batizado === 'sim' ? 'Sim' : p.batizado === 'nao' ? 'Não' : ''], ['Primeira vez', p.primeiraVez],
    ['Medicamento', p.medicamento], ['Alergia', p.alergia], ['Restrição alimentar', p.restricao],
    ['Emergência', p.emergencia], ['Locomoção', p.locomocao], ['Comprador', p.comprador],
    ['Check-in', p.checkinEm && `${p.checkinEm}${p.checkinPor ? ' por ' + p.checkinPor : ''}`],
    ['Pago na recepção', p.pagoRecEm && `${p.pagoRecEm}${p.valorRec ? ' · ' + brl(p.valorRec) : ''}`],
  ].filter(([, v]) => v).map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('');
  return `<div class="pessoa ${p.checkin ? 'presente' : ''}">
    <div>
      <div class="nome">${esc(p.nome)}</div>
      ${info ? `<div class="info">${info}</div>` : ''}
      <div class="selos">
        <span class="pill">${esc(CATS[p.cat])}</span>
        ${seloPagamento(p)}
        ${p.checkin ? `<span class="pill azul">Presente${p.checkinEm ? ' · ' + esc(p.checkinEm.split(' ')[1] || p.checkinEm) : ''}</span>` : '<span class="pill neutro">Sem check-in</span>'}
      </div>
    </div>
    <div class="acoes">
      ${!p.checkin && !p.cancelado ? `<button class="btn ok" data-acao="checkin" data-linha="${p.linha}">✓ Check-in</button>` : ''}
      ${!p.pago && !p.cancelado ? `<button class="btn" data-acao="pagar" data-linha="${p.linha}">Receber pagamento</button>` : ''}
      <button class="btn pequeno" data-acao="detalhes" data-linha="${p.linha}">${aberto ? 'Menos' : 'Detalhes'}</button>
    </div>
    ${aberto ? `<div class="extra">${extra}
      <div style="grid-column:1/-1" class="linha-botoes">
        ${p.checkin ? `<button class="btn pequeno perigo" data-acao="descheckin" data-linha="${p.linha}">Desfazer check-in</button>` : ''}
        ${p.metodoRec ? `<button class="btn pequeno perigo" data-acao="estornar" data-linha="${p.linha}">Desfazer pagamento da recepção</button>` : ''}
      </div></div>` : ''}
  </div>`;
}

function renderRecepcao() {
  const el = $('#listaRecepcao');
  if (!configurado()) { el.innerHTML = boasVindas(); $('#contadorPresenca').textContent = ''; return; }
  const ativos = st.pessoas.filter((p) => !p.cancelado);
  $('#contadorPresenca').textContent = `${ativos.filter((p) => p.checkin).length} de ${ativos.length} presentes`;
  $$('#filtrosRecepcao .chip').forEach((b) => b.classList.toggle('ativo', b.dataset.filtro === st.filtro));
  const l = filtrarRecepcao();
  const LIM = 60;
  el.innerHTML = l.length
    ? l.slice(0, LIM).map(cartaoPessoa).join('') + (l.length > LIM ? `<div class="vazio">Mostrando ${LIM} de ${l.length}. Refine a busca.</div>` : '')
    : `<div class="vazio">Ninguém encontrado. <button class="btn" data-acao="novoCadastro">+ Cadastrar ${st.busca ? '“' + esc(st.busca) + '”' : 'nova pessoa'}</button></div>`;
}

/* ---------- configuração (tela) ---------- */
function renderConfig() {
  const f = $('#formConfig');
  for (const k of ['planilha', 'url', 'chave', 'atendente', 'valorPadrao', 'metodosRecepcao', 'evento']) {
    if (document.activeElement !== f[k]) f[k].value = cfg[k] || '';
  }
  const abas = st.abas.length ? st.abas : (cfg.aba ? [cfg.aba] : []);
  f.aba.innerHTML = `<option value="">(primeira aba)</option>` + abas.map((a) => `<option ${a === cfg.aba ? 'selected' : ''}>${esc(a)}</option>`).join('');
  const s = $('#statusConexao');
  if (cfg.demo) s.textContent = 'Usando dados de demonstração.';
  else if (st.carregadoEm && !st.erro) s.innerHTML = `<span class="pill ok">Conectado</span> ${esc(st.planilha)} › ${esc(st.aba)} — ${st.pessoas.length} registros`;
  else if (st.erro) s.innerHTML = `<span class="pill erro">Erro</span> ${esc(st.erro)}`;
  else s.textContent = '';

  const m = $('#mapaColunas');
  if (!st.cab.length) { m.innerHTML = '<p class="muted col-3">Conecte a planilha para ver as colunas.</p>'; return; }
  m.innerHTML = CAMPOS.map((c) => {
    const atual = st.idx[c.k] >= 0 ? st.cab[st.idx[c.k]] : '';
    return `<label>${esc(c.nome)}
      <select data-campo="${c.k}">
        <option value="" ${!cfg.mapa[c.k] ? 'selected' : ''}>Automático${atual && !cfg.mapa[c.k] ? ' → ' + esc(atual) : ' (não encontrada)'}</option>
        <option value="-" ${cfg.mapa[c.k] === '-' ? 'selected' : ''}>(não usar)</option>
        ${st.cab.map((h) => `<option value="${esc(h)}" ${cfg.mapa[c.k] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}
      </select></label>`;
  }).join('');
}

async function salvarConfig(ev) {
  ev.preventDefault();
  const f = ev.target;
  const antes = cfg.planilha + '|' + cfg.aba;
  for (const k of ['planilha', 'url', 'chave', 'atendente', 'valorPadrao', 'metodosRecepcao', 'evento', 'aba']) cfg[k] = f[k].value.trim();
  if (antes !== cfg.planilha + '|' + cfg.aba) cfg.mapa = {};
  cfg.demo = false;
  salvarCfg();
  st.pessoas = []; st.cab = []; st.carregadoEm = null;
  await recarregar();
  if (!st.erro) toast(`Conectado: ${st.planilha} (${st.pessoas.length} registros).`, 'ok');
}

/* ---------- modal genérico ---------- */
function modal({ titulo: t, corpo, botoes = [], ler, validar }) {
  const dlg = $('#modal');
  const form = $('#modalForm');
  $('#modalTitulo').textContent = t;
  $('#modalCorpo').innerHTML = corpo;
  $('#modalBotoes').innerHTML = `<button class="btn" value="cancelar" formnovalidate>Cancelar</button>` +
    botoes.map((b) => `<button class="btn ${b.cls || ''}" value="${b.v}">${esc(b.t)}</button>`).join('');
  return new Promise((resolve) => {
    let dados = null;
    const aoEnviar = (e) => {
      const v = e.submitter ? e.submitter.value : 'cancelar';
      if (v !== 'cancelar' && ler) {
        dados = ler(form);
        const erro = validar && validar(dados);
        if (erro) { e.preventDefault(); toast(erro, 'erro'); return; }
      }
      dlg.returnValue = v;
    };
    form.addEventListener('submit', aoEnviar);
    dlg.addEventListener('close', function fim() {
      dlg.removeEventListener('close', fim);
      form.removeEventListener('submit', aoEnviar);
      const v = dlg.returnValue || 'cancelar';
      resolve(v === 'cancelar' ? null : (ler ? { v, dados } : v));
    });
    dlg.returnValue = '';
    dlg.showModal();
    const foco = $('#modalCorpo input:not([type=checkbox]), #modalCorpo select', dlg);
    if (foco) foco.focus();
  });
}

/* ---------- interface geral ---------- */
function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'erro' ? 7000 : 3500);
}
let contaCarregando = 0;
function carregando(on, txt) {
  contaCarregando += on ? 1 : -1;
  if (txt) $('#carregandoTexto').textContent = txt;
  $('#carregando').hidden = contaCarregando <= 0;
}

const TELAS = ['painel', 'recepcao', 'config'];
function telaAtual() { const h = location.hash.slice(1); return TELAS.includes(h) ? h : (configurado() ? 'painel' : 'config'); }
function irPara(t) { location.hash = '#' + t; }

function renderizar() {
  const t = telaAtual();
  TELAS.forEach((x) => { $('#tela-' + x).hidden = x !== t; });
  $$('.abas a').forEach((a) => a.classList.toggle('ativa', a.dataset.tela === t));
  $('#faixaDemo').hidden = !cfg.demo;
  $('#tituloEvento').textContent = cfg.evento || 'Encontro com Deus';
  $('#subtitulo').textContent = cfg.demo ? 'Demonstração' : (st.planilha ? `${st.planilha}${st.aba ? ' › ' + st.aba : ''}` : 'Sem planilha conectada');
  $('#atualizadoEm').textContent = st.carregadoEm ? 'Atualizado às ' + st.carregadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  if (t === 'painel') renderPainel();
  if (t === 'recepcao') renderRecepcao();
  if (t === 'config') renderConfig();
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acao], [data-filtro], [data-filtrogrupo]');
  if (!b) return;
  if (b.dataset.filtro) { st.filtro = b.dataset.filtro; renderRecepcao(); return; }
  if (b.dataset.filtrogrupo) { st.filtroGrupo = b.dataset.filtrogrupo; renderPainel(); return; }
  const p = b.dataset.linha ? acharPessoa(b.dataset.linha) : null;
  switch (b.dataset.acao) {
    case 'recarregar': await recarregar(); break;
    case 'novoCadastro': await novoCadastro(); break;
    case 'checkin': if (p) await fazerCheckin(p); break;
    case 'descheckin': if (p) await desfazerCheckin(p); break;
    case 'pagar': if (p) await receberPagamento(p); break;
    case 'estornar': if (p) await estornarPagamentoRecepcao(p); break;
    case 'detalhes': if (p) { st.abertos.has(p.linha) ? st.abertos.delete(p.linha) : st.abertos.add(p.linha); renderRecepcao(); } break;
    case 'salvarMapa':
      cfg.mapa = {};
      $$('#mapaColunas select').forEach((s) => { if (s.value) cfg.mapa[s.dataset.campo] = s.value; });
      salvarCfg(); st.idx = mapear(st.cab); st.pessoas = st.linhas.map(montarPessoa).filter(Boolean);
      toast('Colunas salvas.', 'ok'); renderizar(); break;
    case 'prepararColunas':
      if (!configurado()) { toast('Conecte a planilha primeiro.', 'erro'); break; }
      await gravar('garantirColunas', { colunas: Object.values(SIS) }, 'Colunas de controle prontas na planilha.'); break;
    case 'copiarScript':
      try { await navigator.clipboard.writeText(await codigoScript()); toast('Código copiado. Cole no Apps Script.', 'ok'); }
      catch { toast('Não consegui copiar. Abra o arquivo e copie manualmente.', 'erro'); }
      break;
    case 'ativarDemo': cfg.demo = true; salvarCfg(); await recarregar(); irPara('painel'); toast('Modo demonstração ativado.', 'ok'); break;
    case 'resetarDemo': localStorage.removeItem(DEMO_KEY); if (cfg.demo) await recarregar(); toast('Dados de demonstração recriados.', 'ok'); break;
    case 'esquecerConfig': {
      const r = await modal({ titulo: 'Apagar configuração', corpo: '<p>Remove link, URL e chave guardados neste navegador. A planilha não é alterada.</p>', botoes: [{ v: 'sim', t: 'Apagar', cls: 'perigo' }] });
      if (r === 'sim') { localStorage.removeItem(CFG_KEY); cfg = carregarCfg(); Object.assign(st, { cab: [], linhas: [], pessoas: [], abas: [], planilha: '', aba: '', carregadoEm: null, erro: null }); renderizar(); toast('Configuração apagada.'); }
      break;
    }
  }
});

let _codigo = null;
async function codigoScript() {
  if (_codigo) return _codigo;
  const r = await fetch('apps-script/Codigo.gs', { cache: 'no-cache' });
  if (!r.ok) throw new Error('arquivo');
  return (_codigo = await r.text());
}

$('#formConfig').addEventListener('submit', salvarConfig);
let tBusca;
$('#busca').addEventListener('input', (e) => { clearTimeout(tBusca); tBusca = setTimeout(() => { st.busca = e.target.value; renderRecepcao(); }, 120); });
$('#busca').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const l = filtrarRecepcao(); if (l.length === 1 && !l[0].checkin && !l[0].cancelado) fazerCheckin(l[0]); }
});
window.addEventListener('hashchange', () => { renderizar(); if (telaAtual() === 'recepcao') $('#busca').focus(); });

/* Atualização automática (outras mesas de recepção, novas compras no app) */
setInterval(() => {
  if (document.hidden || $('#modal').open || !configurado() || telaAtual() === 'config') return;
  recarregar({ silencioso: true });
}, 45000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && configurado() && st.carregadoEm && Date.now() - st.carregadoEm > 30000) recarregar({ silencioso: true }); });

/* ---------- modo demonstração (dados fictícios, só no navegador) ---------- */
const Demo = {
  carregar() {
    try { const d = JSON.parse(localStorage.getItem(DEMO_KEY)); if (d && d.cab) return d; } catch { /* recria */ }
    const d = Demo.gerar();
    localStorage.setItem(DEMO_KEY, JSON.stringify(d));
    return d;
  },
  salvar(d) { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); },
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
    return { planilha: 'Demonstração — dados fictícios', aba: 'Ingressos', cab, linhas };
  },
  garantir(d, cols) { for (const c of cols) if (c && !d.cab.includes(c)) { d.cab.push(c); d.linhas.forEach((l) => l.push('')); } },
  async api(acao, p) {
    await new Promise((r) => setTimeout(r, 150));
    const d = Demo.carregar();
    if (acao === 'ler') return { ok: true, planilha: d.planilha, aba: d.aba, abas: [d.aba], cabecalho: [...d.cab], linhas: d.linhas.map((l) => [...l]) };
    if (acao === 'garantirColunas') { Demo.garantir(d, p.colunas); Demo.salvar(d); return { ok: true, cabecalho: d.cab }; }
    const v = p.valores || {};
    Demo.garantir(d, Object.keys(v));
    if (acao === 'atualizar') {
      let li = p.linha - 2;
      const ci = d.cab.indexOf(p.chaveColuna);
      if (ci >= 0 && p.chaveValor && (!d.linhas[li] || d.linhas[li][ci] !== p.chaveValor)) li = d.linhas.findIndex((l) => l[ci] === p.chaveValor);
      if (li < 0 || !d.linhas[li]) throw new Error('Registro não encontrado.');
      for (const [k, val] of Object.entries(v)) d.linhas[li][d.cab.indexOf(k)] = String(val ?? '');
      Demo.salvar(d); return { ok: true, linha: li + 2 };
    }
    if (acao === 'inserir') {
      d.linhas.push(d.cab.map((h) => String(v[h] ?? '')));
      Demo.salvar(d); return { ok: true, linha: d.linhas.length + 1 };
    }
    throw new Error('Ação desconhecida: ' + acao);
  },
};

/* ---------- início ---------- */
codigoScript().then((t) => { $('#codigoScript').textContent = t; }).catch(() => { $('#codigoScript').textContent = 'Abra o arquivo apps-script/Codigo.gs do repositório.'; });
renderizar();
if (configurado()) recarregar();
console.info('Encontro com Deus v' + VERSAO);
