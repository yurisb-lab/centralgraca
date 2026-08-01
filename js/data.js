/* data.js — estado global da aplicação, persistência (localStorage + fila de sync com o Firestore), autenticação/sessão e regras de cálculo (financeiro, estoque, fidelidade) */

/* ── DATA STORE ─────────────────────────────────── */
const K = { P:'cdg_pedidos', R:'cdg_receitas', D:'cdg_despesas', V:'cdg_vendas', C:'cdg_config', U:'cdg_user', M:'cdg_materiais', PR:'cdg_produtos', EM:'cdg_estoque_mov', CLI:'cdg_clientes', IA:'cdg_ia_perfis', CHAT:'cdg_chat_hist' };
const COL_MAP = { cdg_pedidos:'pedidos', cdg_receitas:'receitas', cdg_despesas:'despesas', cdg_vendas:'vendas', cdg_materiais:'materiais', cdg_produtos:'produtos_catalogo', cdg_estoque_mov:'estoque_movimentacoes', cdg_clientes:'clientes', cdg_chat_hist:'chat_historico' };
const load  = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const loadO = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };

// Fila de saves pendentes enquanto Firebase não carregou
const _saveQueue = [];
let _fbReady = false;
const save = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (!Array.isArray(v) || !COL_MAP[k]) return;
  if (_fbReady && window.fbSaveCollection) {
    window.fbSaveCollection(COL_MAP[k], v).catch(()=>{});
  } else {
    // Guarda na fila — será processado quando Firebase carregar
    _saveQueue.push({ col: COL_MAP[k], items: v });
  }
};

// Chamado pelo módulo Firebase quando estiver pronto
window.onFbReady = function() {
  _fbReady = true;
  // Processa fila de saves pendentes
  while (_saveQueue.length) {
    const { col, items } = _saveQueue.shift();
    window.fbSaveCollection(col, items).catch(()=>{});
  }
};
window._fbSave = (k,v) => localStorage.setItem(k, JSON.stringify(v));
window.K = K;
window.loadO = loadO;

// Apaga um documento do Firestore pelo id
const fbDel = (colName, id) => {
  if (window.fbDeleteDoc) window.fbDeleteDoc(colName, String(id)).catch(()=>{});
};
let currentUser = loadO(K.U);
let appConfig   = loadO(K.C);
let currentDetailId = null;
let currentClienteKey = null;
let currentScreen   = 'dashboard';
let agendaTab = 'hoje', finTab = 'receitas', vendasTab = 'historico', estoqueTab = 'materiais';
let calDate = new Date();
let pedidosMesesExpandido = new Set();     // meses (YYYY-MM) atualmente expandidos na tela de Pedidos
let pedidosMesesInicializado = new Set();  // controla quais meses já receberam o estado "expandido" padrão
let composicaoAtual = [];   // materiais do produto sendo editado: {matId, qtd}
let itensPedidoAtual = [];  // itens de catálogo do pedido sendo editado: {produtoId, produtoNome, qtd, precoUnit}
let desperdicioAtual = [];  // materiais desperdiçados ao concluir o pedido: {matId, qtd}
/* ── DEMO DATA ───────────────────────────────────── */
function initDemo() {
  // Demo desativado — app usa dados reais do Firestore
  localStorage.setItem('cdg_demo_done', '1');
}
/* ── AUTH ────────────────────────────────────────── */
const USERS = [{ email:'lanekun@gmail.com', senha:'graciosa' }];
const getSenhaAtual = () => { appConfig = loadO(K.C); return appConfig.senhaCustom || USERS[0].senha; };
function doLogin() {
  const email = 'lanekun@gmail.com';
  const pwd   = document.getElementById('login-password').value;
  if (!pwd) { showToast('Informe a senha'); return; }
  if (pwd !== getSenhaAtual()) { showToast('Senha incorreta'); return; }

  currentUser = { email };
  save(K.U, currentUser);

  // Sincroniza do Firestore antes de abrir
  if (window.fbSyncOnBoot) {
    showToast('Carregando dados...');
    window.fbSyncOnBoot().then(() => {
      currentUser = loadO(K.U);
      initDemo();
      bootApp();
    }).catch(() => {
      initDemo();
      bootApp();
    });
  } else {
    initDemo();
    bootApp();
  }
}

// Called by Firebase onAuthStateChanged when user is already logged in
window.fbAuthReady = function(user) {
  currentUser = { email: user.email, uid: user.uid };
  save(K.U, currentUser);
  window.fbSyncOnBoot().then(() => { initDemo(); bootApp(); });
};
window.fbSignedOut = function() {
  // only act if app is showing
  if (document.getElementById('app').classList.contains('active')) {
    document.getElementById('app').classList.remove('active');
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('fab').style.display = 'none';
    closeSideNav();
    document.getElementById('side-nav').style.display = 'none';
    document.getElementById('menu-fab').style.display = 'none';
    document.getElementById('side-nav-overlay').style.display = 'none';
  }
};
function doLogout() {
  if (!confirm('Sair da conta?')) return;
  save(K.U, {});
  currentUser = {};
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-password').value = '';
  document.getElementById('fab').style.display = 'none';
  closeSideNav();
  document.getElementById('side-nav').style.display = 'none';
  document.getElementById('menu-fab').style.display = 'none';
  document.getElementById('side-nav-overlay').style.display = 'none';
}
function bootApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('active');
  document.getElementById('fab').style.display = 'flex';
  document.getElementById('side-nav').style.display = 'flex';
  document.getElementById('menu-fab').style.display = 'flex';
  document.getElementById('side-nav-overlay').style.display = 'block';
  document.getElementById('logged-email').textContent = currentUser.email || '';
  applyVerse();
  navigate('dashboard');
  schedulePush();
}
function showForgot() {
  alert('Recuperação de senha:\nEntre em contato com o administrador ou redefina via Firebase Console.');
}
/* ── ALERTAS (pedido parado, saldo pendente, risco de prazo) ───── */
function calcularAlertasPedidos() {
  const pedidos = load(K.P);
  const hoje = todayStr();
  const agora = new Date();
  const alertas = [];
  const adormecido = (p, tipo) => p.alertaSnoozeTipo === tipo && p.alertaSnoozeAte && p.alertaSnoozeAte >= hoje;

  pedidos.forEach(p => {
    if (p.status === 'Cancelado') return;

    // Pedido "Novo" ou "Em Produção" sem mudar de status há 5+ dias
    if (p.status === 'Novo' || p.status === 'Em Produção') {
      const desde = p.statusDesde || p.criado || agora.toISOString();
      const dias = Math.floor((agora - new Date(desde)) / 86400000);
      if (dias >= 5 && !adormecido(p, 'parado')) {
        alertas.push({ id: p.id, tipo: 'parado', texto: `<b>${p.nome||'Pedido'}</b> está "${p.status}" há ${dias} dias sem atualização.` });
      }
    }

    // Entrega perto (0-3 dias) mas produção ainda nem começou
    if (p.status === 'Novo' && p.dataEntrega) {
      const diasPrazo = Math.round((new Date(p.dataEntrega) - new Date(hoje)) / 86400000);
      if (diasPrazo >= 0 && diasPrazo <= 3 && !adormecido(p, 'prazo')) {
        alertas.push({ id: p.id, tipo: 'prazo', texto: `<b>${p.nome||'Pedido'}</b> entrega em ${diasPrazo===0?'hoje':diasPrazo+' dia(s)'}, mas ainda está como "Novo".` });
      }
    }

    // Pedido já entregue com saldo ainda pendente
    if (p.status === 'Entregue' && (p.pendente||0) > 0 && !adormecido(p, 'saldo')) {
      alertas.push({ id: p.id, tipo: 'saldo', texto: `Pedido de <b>${p.nome||'—'}</b> já entregue, mas ainda tem ${fmtM(p.pendente)} pendente.` });
    }
  });

  return alertas;
}
function agruparPedidosPorMes(lista){
  const porMes = {};
  lista.forEach(p=>{
    const ym = p.dataEntrega ? p.dataEntrega.slice(0,7) : 'sem-data';
    if (!porMes[ym]) porMes[ym] = [];
    porMes[ym].push(p);
  });
  return porMes;
}
function mesLabel(ym){
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [y,m] = ym.split('-');
  return `${meses[parseInt(m,10)-1]} de ${y}`;
}
function calcLucroPedido(p){
  const { detalhes, custoTotal: custoMateriais } = calcMateriaisItens(p.itens||[]);
  const custoExtras = p.custosExtras||0;
  const custoTotal  = custoMateriais + custoExtras;
  const lucroBruto  = (p.total||0) - custoTotal;
  const margem      = p.total>0 ? (lucroBruto/p.total*100) : 0;
  return { detalhes, custoMateriais, custoExtras, custoTotal, lucroBruto, margem };
}

// Mostra o custo real (materiais + outros custos) e o lucro real de um pedido
/* ── CLIENTES (histórico de compras e fidelização) ────────── */
function getClienteKey(p) {
  if (p.whatsapp) {
    const d = p.whatsapp.replace(/\D/g, '');
    if (d) return 'wa:' + d;
  }
  return 'nm:' + (p.nome || '').trim().toLowerCase();
}
function aggregateClientes() {
  const pedidos = load(K.P);
  const cadastrados = load(K.CLI);
  const map = {};

  // Clientes cadastrados de verdade entram primeiro (mesmo sem nenhum pedido ainda)
  cadastrados.forEach(c => {
    map['cli:' + c.id] = { key: 'cli:' + c.id, clienteId: c.id, nome: c.nome, whatsapp: c.whatsapp, obs: c.obs, cadastrado: true, pedidos: [] };
  });

  pedidos.forEach(p => {
    let key;
    if (p.clienteId && map['cli:' + p.clienteId]) {
      key = 'cli:' + p.clienteId;
    } else {
      // Pedido legado (ou cliente vinculado que foi excluído) — agrupa por nome/whatsapp como antes
      key = 'legacy:' + getClienteKey(p);
      if (!map[key]) map[key] = { key, clienteId: null, nome: p.nome, whatsapp: p.whatsapp, cadastrado: false, pedidos: [] };
      if (p.nome)     map[key].nome     = p.nome;
      if (p.whatsapp) map[key].whatsapp = p.whatsapp;
    }
    map[key].pedidos.push(p);
  });

  return Object.values(map).map(c => {
    const validos = c.pedidos.filter(p => p.status !== 'Cancelado');
    const totalGasto = validos.reduce((s, p) => s + (p.total || 0), 0);
    const datas = validos.map(p => p.dataEntrega).filter(Boolean).sort();
    return {
      ...c,
      qtdPedidos: validos.length,
      totalGasto,
      ultimaCompra: datas.length ? datas[datas.length - 1] : null,
      primeiraCompra: datas.length ? datas[0] : null
    };
  }).sort((a, b) => (b.ultimaCompra || '').localeCompare(a.ultimaCompra || ''));
}
function migrarClienteLegado(legacyKey) {
  const c = aggregateClientes().find(x => x.key === legacyKey);
  if (!c) return;
  const id = 'cli' + Date.now();
  const obj = { id, nome: c.nome || '', whatsapp: c.whatsapp || '', obs: '', criado: new Date().toISOString() };
  const cs = load(K.CLI); cs.push(obj); save(K.CLI, cs);
  const legacyPlainKey = legacyKey.replace('legacy:', '');
  const ps = load(K.P);
  let mudou = false;
  ps.forEach(p => { if (!p.clienteId && getClienteKey(p) === legacyPlainKey) { p.clienteId = id; mudou = true; } });
  if (mudou) save(K.P, ps);
  showToast('Cliente cadastrado e pedidos vinculados!');
  if (currentScreen === 'clientes') renderClientes();
  openClienteDetail('cli:' + id);
}
function fidelidadeInfo(c) {
  if (c.qtdPedidos >= 5 || c.totalGasto >= 1500) return { tier: 'ouro',  label: 'Cliente Ouro ✨' };
  if (c.qtdPedidos >= 3 || c.totalGasto >= 600)  return { tier: 'prata', label: 'Cliente Fiel 💛' };
  return null;
}
function tempoDesde(dataStr) {
  if (!dataStr) return '—';
  const meses = Math.max(0, Math.round((new Date(todayStr()) - new Date(dataStr)) / (1000 * 60 * 60 * 24 * 30)));
  if (meses < 1)  return 'menos de 1 mês';
  if (meses < 12) return meses + ' mês' + (meses === 1 ? '' : 'es');
  const anos = Math.floor(meses / 12), restM = meses % 12;
  return anos + ' ano' + (anos === 1 ? '' : 's') + (restM ? ` e ${restM}m` : '');
}
function calcPendente() {
  const t  = parseFloat(document.getElementById('p-total').value)||0;
  const pg = parseFloat(document.getElementById('p-pago').value)||0;
  document.getElementById('p-pendente').value = Math.max(0,t-pg).toFixed(2);
}
function statusEstoqueMaterial(m){
  const e   = parseFloat(m.estoque) || 0;
  const min = parseFloat(m.estoqueMin) || 0;
  if (min > 0){
    if (e >= min * 2)   return { tier:'boa',      cor:'#1F9C5C',       bg:'#E8F8EF',           border:'#A9E8C6',           label:'Boa quantidade' };
    if (e >= min)       return { tier:'acabando', cor:'#C0701A',       bg:'#FFF3E0',           border:'#FBD9A6',           label:'Acabando' };
    if (e >= min * 0.5) return { tier:'baixo',    cor:'var(--danger)', bg:'var(--rose-pale)',  border:'var(--rose-light)', label:'Baixo' };
    return                 { tier:'critico', cor:'var(--danger)', bg:'var(--rose-pale)',  border:'var(--rose-light)', label:'Crítico' };
  }
  // Sem mínimo definido: usa faixas gerais como aproximação
  if (e >= 100) return { tier:'boa',      cor:'#1F9C5C',      bg:'#E8F8EF',        border:'#A9E8C6',       label:'Boa quantidade' };
  if (e >= 50)  return { tier:'acabando', cor:'#C0701A',      bg:'#FFF3E0',        border:'#FBD9A6',       label:'Acabando' };
  if (e >= 20)  return { tier:'baixo',    cor:'var(--danger)', bg:'var(--rose-pale)', border:'var(--rose-light)', label:'Baixo' };
  return          { tier:'critico',  cor:'var(--danger)', bg:'var(--rose-pale)', border:'var(--rose-light)', label:'Crítico' };
}

// Lista de materiais em ordem alfabética, com sinalização visual do nível de estoque
function custoComposicao(comp){
  const mats = load(K.M);
  return (comp||[]).reduce((s,c)=>{
    const m = mats.find(x=>x.id===c.matId);
    return s + (m ? (m.custo||0)*(c.qtd||0) : 0);
  }, 0);
}
/* -- Categorias de produto (lista editável, evita categorias soltas/duplicadas) -- */
function getCategoriasProdutos(){
  appConfig = loadO(K.C);
  let cats = appConfig.categoriasProdutos;
  if (!cats || !cats.length) cats = ['Fotos','Convites','Lembrancinhas','Decoração','Papelaria','Outros'];
  // Traz para a lista categorias antigas já usadas em produtos (cadastro livre anterior)
  const usadas = [...new Set(load(K.PR).map(p=>p.categoria).filter(Boolean))];
  usadas.forEach(c=>{ if (!cats.includes(c)) cats.push(c); });
  return cats;
}
function calcularRendimentoComposicao(){
  const usado = parseFloat(document.getElementById('pr-comp-rende-usado').value);
  const rende = parseFloat(document.getElementById('pr-comp-rende-qtd').value);
  if (!usado || usado<=0 || !rende || rende<=0){ showToast('Informe a quantidade usada e quantas unidades ela rende'); return; }
  const qtdPorUnidade = usado / rende;
  document.getElementById('pr-comp-qtd').value = qtdPorUnidade.toFixed(4);
  document.getElementById('pr-comp-rende-usado').value = '';
  document.getElementById('pr-comp-rende-qtd').value = '';
  showToast('Qtd por unidade calculada: ' + qtdPorUnidade.toFixed(4));
}
function calcularCustoPacote(prefix){
  const valor = parseFloat(document.getElementById(prefix+'-pacote-valor').value);
  const qtd   = parseFloat(document.getElementById(prefix+'-pacote-qtd').value);
  if (!valor || !qtd || qtd <= 0){ showToast('Informe o preço do pacote e a quantidade de unidades nele'); return; }
  const custoUnit = valor / qtd;
  document.getElementById(prefix+'-custo').value = custoUnit.toFixed(4);
  showToast('Custo unitário calculado: ' + fmtM(custoUnit));
  if (prefix === 'ee') updateEeTotalPreview();
}

// Na Entrada de estoque: se a pessoa souber apenas o valor total pago (ex: pacote de 50 folhas por R$15),
// calcula o custo unitário automaticamente a partir da quantidade comprada já informada
function calcMateriaisItens(itens){
  const prods = load(K.PR), mats = load(K.M);
  const consumo = {};
  (itens||[]).forEach(it=>{
    const prod = prods.find(p=>p.id===it.produtoId);
    (prod?.composicao||[]).forEach(c=>{
      consumo[c.matId] = (consumo[c.matId]||0) + c.qtd*it.qtd;
    });
  });
  let custoTotal = 0;
  const detalhes = Object.entries(consumo).map(([matId,qtd])=>{
    const m = mats.find(x=>x.id===matId);
    const custo = m ? m.custo*qtd : 0;
    custoTotal += custo;
    return { matId, nome: m?m.nome:'Material removido', unidade: m?.unidade||'', qtd, custo };
  });
  return { detalhes, custoTotal };
}
function logMovimentoEstoque(matId, tipo, qtd, custoUnit, motivo){
  if (!matId || !qtd) return;
  const ms = load(K.EM);
  ms.push({
    id: 'em'+Date.now()+Math.random().toString(36).slice(2,7),
    matId, tipo, qtd: Math.abs(qtd),
    custoUnit: custoUnit||0,
    valor: (custoUnit||0)*Math.abs(qtd),
    data: todayStr(),
    motivo: motivo||''
  });
  save(K.EM, ms);
}

// Ajusta o estoque de materiais: devolve o consumo dos itens antigos e retira o consumo dos itens novos
function aplicarConsumoEstoque(itensAntigos, itensNovos, motivo){
  const { detalhes: antigos } = calcMateriaisItens(itensAntigos||[]);
  const { detalhes: novos }   = calcMateriaisItens(itensNovos||[]);
  if (!antigos.length && !novos.length) return;
  const delta = {}; // consumo líquido por material (positivo = retirar do estoque)
  antigos.forEach(d=>{ delta[d.matId] = (delta[d.matId]||0) - d.qtd; });
  novos.forEach(d=>{ delta[d.matId] = (delta[d.matId]||0) + d.qtd; });
  const mats = load(K.M);
  let mudou = false;
  Object.entries(delta).forEach(([matId, qtdLiquida])=>{
    if (!qtdLiquida) return;
    const idx = mats.findIndex(m=>m.id===matId);
    if (idx>=0){
      mats[idx].estoque = (mats[idx].estoque||0) - qtdLiquida;
      mudou = true;
      // Loga a movimentação: qtdLiquida > 0 => saída (consumo); < 0 => entrada (devolução/ajuste)
      if (qtdLiquida > 0) logMovimentoEstoque(matId, 'saida', qtdLiquida, mats[idx].custo, motivo||'Consumo em pedido');
      else                logMovimentoEstoque(matId, 'entrada', -qtdLiquida, mats[idx].custo, motivo||'Estorno de pedido');
    }
  });
  if (mudou) save(K.M, mats);
}
const active=p=>p.status!=='Entregue'&&p.status!=='Cancelado';
/* ── FINANCEIRO ──────────────────────────────────── */
let finReceitasExpandido = new Set([String(new Date().getFullYear())]);
let finDespesasExpandido = new Set([String(new Date().getFullYear())]);
function agruparPorAno(lista){
  const porAno = {};
  lista.forEach(item=>{
    if(!item.data) return;
    const ano = item.data.slice(0,4);
    if(!porAno[ano]) porAno[ano] = [];
    porAno[ano].push(item);
  });
  return porAno;
}
function calcFin(){
  const now=new Date();
  const mes=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const recReceitas=load(K.R).filter(r=>r.data.startsWith(mes)).reduce((s,r)=>s+(r.valor||0),0);
  const recVendas   =load(K.V).filter(v=>v.data&&v.data.startsWith(mes)).reduce((s,v)=>s+(v.valor||0),0);
  const rec  =recReceitas+recVendas;
  const gasto=load(K.D).filter(d=>d.data.startsWith(mes)).reduce((s,d)=>s+(d.valor||0),0);
  const pend =load(K.P).filter(p=>p.status!=='Cancelado').reduce((s,p)=>s+(p.pendente||0),0);
  return{rec,gasto,pend,recReceitas,recVendas};
}

// Visão de lucratividade real por pedido: valor pago, custo de materiais, outros custos, lucro bruto e margem
function exportData(){
  const blob=new Blob([JSON.stringify({pedidos:load(K.P),receitas:load(K.R),despesas:load(K.D),vendas:load(K.V)},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`graca-em-papel-${todayStr()}.json`;a.click();
  showToast('Dados exportados.');
}
/* ── HELPERS ─────────────────────────────────────── */
const todayStr  = ()=>new Date().toISOString().split('T')[0];
const offsetDate= n=>{ const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().split('T')[0]; };
const formatDate= s=>{ if(!s)return'—';const[y,m,d]=s.split('-');return`${d}/${m}/${y}`; };
const fmtM      = v=>'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const isAtrasado= p=>p.dataEntrega&&p.status!=='Entregue'&&p.status!=='Cancelado'&&p.dataEntrega<todayStr();
const diasAtraso= p=>Math.round((new Date(todayStr())-new Date(p.dataEntrega))/(86400000));
const sortByDate= (a,b)=>(a.dataEntrega||'').localeCompare(b.dataEntrega||'');
