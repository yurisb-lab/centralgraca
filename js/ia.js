/* ia.js — integrações externas: análise de clientes e assistente de chat via Gemini, importação de pedido a partir de conversa, upload de fotos via Cloudinary */

/* ── ÁREA IA (perfil e sugestões por cliente) ────────────── */
function loadIaPerfis(){ return loadO(K.IA); }
function saveIaPerfil(clienteKey, data){
  const all = loadIaPerfis();
  all[clienteKey] = data;
  // K.IA guarda um objeto (não um array), então não passa pelo save() genérico —
  // gravamos local e enviamos ao Firestore manualmente, para sincronizar entre dispositivos.
  localStorage.setItem(K.IA, JSON.stringify(all));
  if (window.fbSaveCollection) {
    window.fbSaveCollection('ia_perfis', [{ id: clienteKey, ...data }]).catch(()=>{});
  }
}
function renderIaScreen(){
  const q = (document.getElementById('search-ia')?.value || '').toLowerCase();
  const clientes = aggregateClientes().filter(c => !q || (c.nome||'').toLowerCase().includes(q));
  const perfis = loadIaPerfis();
  document.getElementById('list-ia').innerHTML = clientes.length
    ? clientes.map(c => iaClienteCardHTML(c, perfis[c.key])).join('')
    : emptyHTML('Nenhum cliente encontrado.<br><strong>Clientes aparecem aqui após o primeiro pedido.</strong>');
}
function iaClienteCardHTML(c, perfil){
  const resumo = perfil?.resumoPerfil || '';
  return `
  <div class="pedido-card" onclick="abrirAnaliseIA('${c.key}')">
    <div class="pedido-card-header">
      <div>
        <div class="pedido-nome">${c.nome || '—'}</div>
        <div class="pedido-sub">${c.qtdPedidos} pedido${c.qtdPedidos===1?'':'s'} · ${fmtM(c.totalGasto)} em compras</div>
      </div>
      ${perfil ? `<span class="badge badge-pronto">Analisado</span>` : `<span class="badge badge-novo">Sem análise</span>`}
    </div>
    ${resumo ? `<div class="pedido-meta"><span class="pedido-meta-item" style="color:var(--text-mid)">${resumo.length>90?resumo.slice(0,90)+'…':resumo}</span></div>` : ''}
  </div>`;
}
let _iaClienteAtual = null;

// Lê um arquivo .txt selecionado e coloca o conteúdo no campo de conversa recente da análise IA
function importarTxtIaCliente(input){
  const file = input.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.txt')) { showToast('Selecione um arquivo .txt'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    const texto = (e.target.result || '').toString();
    const campo = document.getElementById('ia-conversa-extra');
    campo.value = campo.value ? (campo.value + '\n' + texto) : texto;
    showToast('Arquivo importado! Revise o texto antes de gerar a análise.');
  };
  reader.onerror = () => showToast('Não foi possível ler o arquivo.');
  reader.readAsText(file, 'UTF-8');
  input.value = '';
}
function abrirAnaliseIA(clienteKey){
  _iaClienteAtual = clienteKey;
  const c = aggregateClientes().find(x => x.key === clienteKey);
  if (!c) return;
  document.getElementById('ia-modal-nome').textContent = c.nome || '—';
  document.getElementById('ia-modal-sub').textContent = `${c.qtdPedidos} pedido(s) · ${fmtM(c.totalGasto)} em compras`;
  document.getElementById('ia-conversa-extra').value = '';
  document.getElementById('ia-conversa-arquivo').value = '';
  document.getElementById('ia-resultado').style.display = 'block';
  renderIaResultado(loadIaPerfis()[clienteKey]);
  closeModal('modal-cliente');
  openModal('modal-ia');
}
function renderIaResultado(perfil, targetId='ia-resultado'){
  const wrap = document.getElementById(targetId);
  if (!wrap) return;
  if (!perfil){
    wrap.innerHTML = targetId==='ia-resultado'
      ? '<div style="font-size:12px;color:var(--text-soft)">Nenhuma análise gerada ainda. Cole uma conversa (opcional) e toque em "Gerar análise com IA".</div>'
      : '';
    return;
  }
  wrap.innerHTML = `
    <div class="card" style="background:var(--blue-pale);border:none;box-shadow:none;padding:14px 16px">
      <div class="card-label">Perfil</div>
      <p style="font-size:13px;color:var(--text-mid);line-height:1.6">${perfil.resumoPerfil || '—'}</p>
      ${perfil.preferencias ? `<div style="font-size:12px;color:var(--text-mid);margin-top:8px"><b>Preferências:</b> ${perfil.preferencias}</div>` : ''}
      ${perfil.frequencia ? `<div style="font-size:12px;color:var(--text-mid);margin-top:4px"><b>Frequência de compra:</b> ${perfil.frequencia}</div>` : ''}
      ${perfil.risco ? `<div style="font-size:12px;color:var(--danger);margin-top:8px">⚠️ ${perfil.risco}</div>` : ''}
    </div>
    ${perfil.sugestoesProdutos && perfil.sugestoesProdutos.length ? `
    <div class="card">
      <div class="card-label">Sugestões de produtos/ações</div>
      ${perfil.sugestoesProdutos.map(s => `<div class="tx-row"><div class="tx-left"><div style="font-size:13px">💡 ${s}</div></div></div>`).join('')}
    </div>` : ''}
    ${perfil.mensagemSugerida ? `
    <div class="card">
      <div class="card-label">Mensagem sugerida</div>
      <p style="font-size:13px;color:var(--text-mid);line-height:1.6;white-space:pre-wrap">${perfil.mensagemSugerida}</p>
      <button class="btn btn-rose btn-sm" style="width:100%;margin-top:10px" onclick="usarMensagemIA()">Enviar / copiar mensagem</button>
    </div>` : ''}
    <div style="font-size:11px;color:var(--text-soft);text-align:center;margin-top:4px">Atualizado em ${formatDate(perfil.atualizadoEm)}</div>
  `;
}
function usarMensagemIA(){
  const perfil = loadIaPerfis()[_iaClienteAtual];
  const c = aggregateClientes().find(x => x.key === _iaClienteAtual);
  if (!perfil || !c) return;
  const wa = c.whatsapp ? `https://wa.me/55${c.whatsapp.replace(/\D/g,'')}` : null;
  abrirModalMsg('💌 Mensagem sugerida pela IA', perfil.mensagemSugerida, wa);
}
async function gerarAnaliseIA(){
  const c = aggregateClientes().find(x => x.key === _iaClienteAtual);
  if (!c) return;
  appConfig = loadO(K.C);
  const apiKey = appConfig.geminiApiKey;
  if (!apiKey){
    showToast('Configure a chave da API do Gemini em Configurações primeiro.');
    closeModal('modal-ia');
    showApiKeyConfig();
    return;
  }
  const conversaExtra = document.getElementById('ia-conversa-extra').value.trim();
  const historico = c.pedidos
    .filter(p => p.status !== 'Cancelado')
    .sort((a,b) => (a.dataEntrega||'').localeCompare(b.dataEntrega||''))
    .map(p => `- ${p.dataEntrega || 'sem data'}: ${produtosResumoPedido(p) || p.produtos || '—'} (${fmtM(p.total)})${p.obs ? ' · obs: ' + p.obs : ''}`)
    .join('\n') || 'Nenhum pedido registrado ainda.';

  document.getElementById('ia-loading').style.display = 'block';
  document.getElementById('ia-resultado').style.display = 'none';
  document.getElementById('ia-gerar-btn').disabled = true;

  const prompt = `Você é um assistente de uma confeiteira/papelaria personalizada chamada "Graça em Papel". Analise o histórico de compras de um cliente e, se houver, uma conversa recente, e gere um perfil útil para fidelização e vendas.

IMPORTANTE — escopo da análise:
- Considere APENAS informações relacionadas a pedidos, produtos, valores, prazos, preferências de compra, datas de eventos e o relacionamento comercial deste cliente com a Graça em Papel.
- Se a conversa recente colada abaixo contiver assuntos pessoais, de terceiros, ou qualquer conteúdo sem relação com pedidos/negócio, ignore completamente esses trechos — não os resuma, não os comente e não os inclua em nenhum campo da resposta.
- Se a conversa não tiver nenhuma informação relevante sobre pedidos/negócio, trate como se ela não tivesse sido enviada e baseie-se apenas no histórico de pedidos.

Cliente: ${c.nome}
Total gasto: ${fmtM(c.totalGasto)}
Qtd de pedidos: ${c.qtdPedidos}
Histórico de pedidos:
${historico}
${conversaExtra ? `\nConversa recente colada pela dona do negócio (use apenas as partes relacionadas a pedidos/negócio, conforme instruído acima):\n"""\n${conversaExtra}\n"""` : ''}

Responda APENAS com um JSON válido (sem markdown, sem texto extra) neste formato:
{
  "resumoPerfil": "resumo curto (2-3 frases) do perfil deste cliente",
  "preferencias": "estilo, temas, cores ou produtos que ele parece preferir, ou null",
  "frequencia": "estimativa de frequência de compra (ex: a cada 2 meses), ou null",
  "sugestoesProdutos": ["sugestão 1", "sugestão 2", "sugestão 3"],
  "risco": "alerta se o cliente parece estar afastado ou insatisfeito, ou null",
  "mensagemSugerida": "uma mensagem curta e calorosa de WhatsApp para reengajar ou agradecer este cliente, em português, assinada como Graça em Papel"
}`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    const data = await res.json();
    if (!res.ok) { showToast('Erro na API: ' + (data?.error?.message || res.status)); return; }
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) { showToast('A IA não retornou dados. Tente novamente.'); return; }
    let perfil;
    try { perfil = JSON.parse(raw); }
    catch { showToast('Não foi possível interpretar a resposta da IA.'); return; }
    perfil.atualizadoEm = todayStr();
    saveIaPerfil(_iaClienteAtual, perfil);
    renderIaResultado(perfil);
    if (currentScreen === 'ia') renderIaScreen();
    showToast('Análise gerada com sucesso!');
  } catch(e) {
    showToast('Erro ao conectar com a IA. Verifique sua chave e conexão.');
  } finally {
    document.getElementById('ia-loading').style.display = 'none';
    document.getElementById('ia-resultado').style.display = 'block';
    document.getElementById('ia-gerar-btn').disabled = false;
  }
}

/* ── ASSISTENTE GERAL (chat com IA sobre todo o negócio) ─────────
   A IA nunca recebe os dados brutos: o app monta um resumo (snapshot)
   já calculado pelas próprias funções do sistema (calcFin, aggregateClientes,
   calcLucroPedido, estoque etc). A IA só interpreta e conversa em cima disso —
   isso evita que ela "invente" ou erre contas de faturamento/lucro/estoque. */
let chatAssistenteHistorico = []; // [{role:'user'|'model', text:''}] — conversa atual (sessão em memória)
let chatHistoricoExpandido = new Set(); // ids das conversas antigas persistidas que estão expandidas na tela
function montarSnapshotNegocio(){
  const pedidos = load(K.P);
  const hoje = todayStr();

  const atrasados = pedidos.filter(isAtrasado).map(p=>({
    nome: p.nome, dataEntrega: p.dataEntrega, diasAtraso: diasAtraso(p),
    status: p.status, pendente: Math.max(0,(p.total||0)-(p.pago||0))
  }));

  const proximasEntregas = pedidos
    .filter(p=>p.status!=='Entregue'&&p.status!=='Cancelado'&&p.dataEntrega&&p.dataEntrega>=hoje&&p.dataEntrega<=offsetDate(7))
    .sort(sortByDate)
    .map(p=>({ nome:p.nome, dataEntrega:p.dataEntrega, status:p.status, produtos: produtosResumoPedido(p) }));

  const { rec, gasto, pend, recReceitas, recVendas } = calcFin();
  appConfig = loadO(K.C);
  const meta = parseFloat(appConfig.metaMensal)||0;

  const clientes = aggregateClientes();
  const clientesTop = [...clientes].sort((a,b)=>b.totalGasto-a.totalGasto).slice(0,8)
    .map(c=>({ nome:c.nome, totalGasto:c.totalGasto, qtdPedidos:c.qtdPedidos, ultimaCompra:c.ultimaCompra }));
  const clientesAfastados = clientes.filter(c=>{
    if (!c.ultimaCompra) return false;
    const dias = Math.round((new Date(hoje)-new Date(c.ultimaCompra))/86400000);
    return dias >= 90;
  }).map(c=>({ nome:c.nome, ultimaCompra:c.ultimaCompra, totalGasto:c.totalGasto }));

  const materiais = load(K.M);
  const estoqueBaixo = materiais.filter(m=>(m.estoqueMin||0)>0 && (m.estoque||0)<=(m.estoqueMin||0))
    .map(m=>({ nome:m.nome, estoque:m.estoque, estoqueMin:m.estoqueMin, unidade:m.unidade }));
  const valorEstoqueAtual = materiais.reduce((s,m)=>s+((m.custo||0)*(m.estoque||0)),0);

  const pedidosComValor = pedidos.filter(p=>p.status!=='Cancelado' && (p.total||0)>0);
  let lucroTotal=0, vendaTotal=0;
  pedidosComValor.forEach(p=>{ const c=calcLucroPedido(p); lucroTotal+=c.lucroBruto; vendaTotal+=p.total||0; });
  const margemMedia = vendaTotal>0 ? (lucroTotal/vendaTotal*100) : 0;

  const produtos = load(K.PR).filter(p=>p.status!=='Inativo').map(p=>{
    const custo = custoComposicao(p.composicao);
    return { nome:p.nome, preco:p.preco, custoEstimado:custo, margem:(p.preco||0)-custo };
  });

  return {
    dataDeHoje: hoje,
    contadoresPedidos: {
      novo: pedidos.filter(p=>p.status==='Novo').length,
      emProducao: pedidos.filter(p=>p.status==='Em Produção').length,
      pronto: pedidos.filter(p=>p.status==='Pronto').length,
      entregue: pedidos.filter(p=>p.status==='Entregue').length,
      cancelado: pedidos.filter(p=>p.status==='Cancelado').length,
      atrasados: atrasados.length
    },
    pedidosAtrasados: atrasados,
    proximasEntregas7dias: proximasEntregas,
    financeiroDoMes: { faturamento:rec, deReceitas:recReceitas, deVendasAvulsas:recVendas, gastoDoMes:gasto, lucroEstimadoDoMes:rec-gasto, aReceberNoTotal:pend },
    metaMensal: meta ? { valor:meta, recebidoMes:rec, percentualAtingido: Math.round(rec/meta*100) } : null,
    lucratividadeGeral: { totalVendido:vendaTotal, lucroBrutoTotal:lucroTotal, margemMediaPct: Number(margemMedia.toFixed(1)) },
    clientesTop, clientesAfastados90dias: clientesAfastados,
    estoque: { valorParadoHoje: valorEstoqueAtual, materiaisComEstoqueBaixo: estoqueBaixo },
    catalogoProdutos: produtos
  };
}
function renderAssistenteScreen(){
  renderAssistInsights();
  renderChatAssistente();
  renderChatHistoricoAntigo();
  if (!chatAssistenteHistorico.length){
    document.getElementById('assist-chat').innerHTML = `<div class="assist-msg bot">Oi! 👋 Pode me perguntar qualquer coisa sobre seus pedidos, clientes, estoque ou financeiro. Também dá pra usar os atalhos acima.</div>`;
  }
}

/* -- Histórico persistido do Assistente: guarda cada pergunta+resposta já respondida,
      para que fiquem disponíveis (em pilhas recolhidas) mesmo depois de sair e voltar ao app.
      Não consome IA de novo — é só texto já salvo sendo exibido/expandido. -- */
function loadChatHistoricoPersistido(){
  return [...load(K.CHAT)].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
}
function salvarParChatHistorico(pergunta, resposta){
  const hs = load(K.CHAT);
  hs.push({ id:'ch'+Date.now()+Math.random().toString(36).slice(2,6), pergunta, resposta, data: new Date().toISOString() });
  // Mantém só os últimos 50 registros salvos, pra não crescer sem limite
  hs.sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  save(K.CHAT, hs.slice(-50));
}
function formatDataHoraChat(iso){
  if (!iso) return '';
  const d = new Date(iso);
  const dataStr = d.toISOString().split('T')[0];
  const hora = d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  return (dataStr===todayStr() ? 'Hoje' : formatDate(dataStr)) + ' às ' + hora;
}
function toggleChatHistoricoItem(id){
  if (chatHistoricoExpandido.has(id)) chatHistoricoExpandido.delete(id);
  else chatHistoricoExpandido.add(id);
  renderChatHistoricoAntigo();
}
function renderChatHistoricoAntigo(){
  const el = document.getElementById('assist-historico');
  if (!el) return;
  const itens = loadChatHistoricoPersistido().slice(0, 10);
  if (!itens.length){ el.innerHTML=''; return; }
  el.innerHTML = `
    <div class="section-header" style="margin-top:18px">
      <span class="section-title">Conversas anteriores</span>
    </div>
    ${itens.map(item=>{
      const isOpen = chatHistoricoExpandido.has(item.id);
      const perguntaResumo = item.pergunta.length>60 ? item.pergunta.slice(0,60)+'…' : item.pergunta;
      return `
      <div class="card" style="padding:0;margin-bottom:10px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;cursor:pointer" onclick="toggleChatHistoricoItem('${item.id}')">
          <div style="flex:1;padding-right:10px">
            <div style="font-size:13px;font-weight:600;color:var(--text)">${isOpen?'▾':'▸'} ${escapeHtmlAssist(perguntaResumo)}</div>
            <div style="font-size:11px;color:var(--text-soft);margin-top:2px">${formatDataHoraChat(item.data)}</div>
          </div>
        </div>
        ${isOpen?`<div style="border-top:1px solid var(--border-light);padding:14px 16px;display:flex;flex-direction:column;gap:10px">
          <div class="assist-msg user" style="align-self:flex-end;max-width:100%">${escapeHtmlAssist(item.pergunta)}</div>
          <div class="assist-msg bot" style="align-self:flex-start;max-width:100%">${escapeHtmlAssist(item.resposta)}</div>
        </div>`:''}
      </div>`;
    }).join('')}
  `;
}
function renderAssistInsights(){
  const s = montarSnapshotNegocio();
  const el = document.getElementById('assist-insights');
  const cards = [];
  if (s.contadoresPedidos.atrasados > 0){
    cards.push(`<div class="assist-insight-card" onclick="navigate('agenda')">🔴 <span><b>${s.contadoresPedidos.atrasados}</b> pedido${s.contadoresPedidos.atrasados===1?'':'s'} atrasado${s.contadoresPedidos.atrasados===1?'':'s'}</span></div>`);
  }
  if (s.estoque.materiaisComEstoqueBaixo.length > 0){
    cards.push(`<div class="assist-insight-card" onclick="navigate('estoque')">📦 <span><b>${s.estoque.materiaisComEstoqueBaixo.length}</b> material(is) com estoque baixo</span></div>`);
  }
  if (s.metaMensal){
    cards.push(`<div class="assist-insight-card" onclick="navigate('dashboard')">🎯 <span><b>${s.metaMensal.percentualAtingido}%</b> da meta mensal atingida</span></div>`);
  }
  if (s.clientesAfastados90dias.length > 0){
    cards.push(`<div class="assist-insight-card" onclick="navigate('clientes')">💌 <span><b>${s.clientesAfastados90dias.length}</b> cliente(s) sem comprar há 90+ dias</span></div>`);
  }
  el.innerHTML = cards.join('');
}
function renderChatAssistente(){
  const el = document.getElementById('assist-chat');
  if (!chatAssistenteHistorico.length) return; // mensagem de boas-vindas é tratada em renderAssistenteScreen
  el.innerHTML = chatAssistenteHistorico.map(m=>`<div class="assist-msg ${m.role==='user'?'user':'bot'}">${escapeHtmlAssist(m.text)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}
function escapeHtmlAssist(t){
  return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function perguntarRapido(pergunta){
  document.getElementById('assist-input').value = pergunta;
  enviarPerguntaAssistente();
}
async function enviarPerguntaAssistente(){
  const input = document.getElementById('assist-input');
  const pergunta = input.value.trim();
  if (!pergunta) return;

  appConfig = loadO(K.C);
  const apiKey = appConfig.geminiApiKey;
  if (!apiKey){
    showToast('Configure a chave da API do Gemini em Configurações primeiro.');
    showApiKeyConfig();
    return;
  }

  chatAssistenteHistorico.push({ role:'user', text: pergunta });
  input.value = '';
  renderChatAssistente();
  document.getElementById('assist-loading').style.display = 'block';

  const snapshot = montarSnapshotNegocio();

  const systemPrompt = `Você é o assistente virtual de dentro do app de gestão de uma confeiteira/papelaria personalizada chamada "Graça em Papel". Você conversa com a dona do negócio e responde perguntas sobre pedidos, clientes, estoque, financeiro e produtos.

IMPORTANTE:
- Use APENAS os dados do resumo (snapshot) abaixo para responder. Não invente números. Se a pergunta não puder ser respondida com esses dados, diga isso claramente e sugira onde ela pode ver mais detalhes no app (ex: tela de Pedidos, Financeiro, Estoque).
- Responda apenas sobre o negócio (pedidos, clientes, produtos, estoque, financeiro). Se a pergunta for sobre outro assunto, explique educadamente que você só ajuda com o negócio.
- Seja direta, calorosa e objetiva, em português do Brasil. Use valores em R$ quando fizer sentido. Evite respostas longas demais — poucos parágrafos ou uma lista curta já resolve.
- Hoje é ${snapshot.dataDeHoje}.

Resumo atual do negócio (JSON):
${JSON.stringify(snapshot)}`;

  // Só manda as últimas 10 mensagens (5 perguntas + 5 respostas) pra não pesar o pedido com o tempo
  const historicoRecente = chatAssistenteHistorico.slice(0, -1).slice(-10);

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Entendido! Estou pronta para ajudar com base nesses dados.' }] },
    ...historicoRecente.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: pergunta }] }
  ];

  // Mensagem do bot "vazia" que vai sendo preenchida em tempo real conforme o texto chega (streaming)
  chatAssistenteHistorico.push({ role:'model', text: '' });
  const idxResposta = chatAssistenteHistorico.length - 1;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(()=>null);
      showToast('Erro na API: ' + (data?.error?.message || res.status));
      chatAssistenteHistorico.splice(idxResposta - 1, 2);
      renderChatAssistente();
      return;
    }

    document.getElementById('assist-loading').style.display = 'none';

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', textoCompleto = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split('\n');
      buffer = linhas.pop();
      for (const linha of linhas) {
        if (!linha.startsWith('data: ')) continue;
        const jsonStr = linha.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const evento = JSON.parse(jsonStr);
          const pedaco = evento?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (pedaco) {
            textoCompleto += pedaco;
            chatAssistenteHistorico[idxResposta].text = textoCompleto;
            renderChatAssistente();
          }
        } catch(e) { /* linha parcial ainda incompleta, ignora e espera o próximo pedaço */ }
      }
    }

    if (!textoCompleto.trim()) {
      showToast('A IA não retornou resposta. Tente novamente.');
      chatAssistenteHistorico.splice(idxResposta - 1, 2);
      renderChatAssistente();
    } else {
      salvarParChatHistorico(pergunta, textoCompleto);
      renderChatHistoricoAntigo();
    }
  } catch(e) {
    showToast('Erro ao conectar com a IA. Verifique sua chave e conexão.');
    chatAssistenteHistorico.splice(idxResposta - 1, 2);
    renderChatAssistente();
  } finally {
    document.getElementById('assist-loading').style.display = 'none';
  }
}
function compressImage(file, quality=0.9, maxSize=1200) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else       { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    };
    img.src = url;
  });
}
async function uploadFotoCloudinary(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('upload-loading').style.display = 'block';
  document.getElementById('upload-placeholder').style.display = 'none';
  document.getElementById('upload-preview').style.display = 'none';
  try {
    // Compress to 90% quality before upload
    const compressed = await compressImage(file, 0.9, 1200);
    const fd = new FormData();
    fd.append('file', compressed, 'foto.jpg');
    fd.append('upload_preset', 'graca-em-papel');
    const res = await fetch('https://api.cloudinary.com/v1_1/dl1vymhde/image/upload', { method:'POST', body:fd });
    const data = await res.json();
    if (data.secure_url) {
      document.getElementById('p-foto-url').value = data.secure_url;
      document.getElementById('upload-img').src = data.secure_url;
      document.getElementById('upload-preview').style.display = 'block';
      showToast('Foto enviada com sucesso!');
    } else {
      showToast('Erro ao enviar foto.');
      document.getElementById('upload-placeholder').style.display = 'block';
    }
  } catch(e) {
    showToast('Erro ao enviar foto.');
    document.getElementById('upload-placeholder').style.display = 'block';
  }
  document.getElementById('upload-loading').style.display = 'none';
}
/* ── IMPORTAR PEDIDO DE UMA CONVERSA (IA - Google Gemini) ────────── */
let _importCliMatch = null; // cliente encontrado na última extração, se houver
function openImportarConversaModal(){
  document.getElementById('imp-conversa-texto').value = '';
  document.getElementById('imp-passo-colar').style.display = 'block';
  document.getElementById('imp-passo-revisao').style.display = 'none';
  document.getElementById('imp-loading').style.display = 'none';
  _importCliMatch = null;
  openModal('modal-importar-conversa');
  setTimeout(()=>document.getElementById('imp-conversa-texto')?.focus(), 250);
}
function voltarImportarConversa(){
  document.getElementById('imp-passo-colar').style.display = 'block';
  document.getElementById('imp-passo-revisao').style.display = 'none';
}

// Tenta casar o nome/whatsapp extraído da conversa com um cliente já cadastrado
function encontrarClienteMatch(nome, whatsapp){
  const cs = load(K.CLI);
  if (!cs.length) return null;
  if (whatsapp) {
    const d = whatsapp.replace(/\D/g,'');
    if (d.length >= 8) {
      const alvo = d.slice(-8); // últimos 8 dígitos, evita divergência de DDI/DDD
      const m = cs.find(c => c.whatsapp && c.whatsapp.replace(/\D/g,'').slice(-8) === alvo);
      if (m) return m;
    }
  }
  if (nome) {
    const n = nome.trim().toLowerCase();
    if (n) {
      const exato = cs.find(c => (c.nome||'').trim().toLowerCase() === n);
      if (exato) return exato;
      const parcial = cs.find(c => {
        const cn = (c.nome||'').trim().toLowerCase();
        return cn && (cn.includes(n) || n.includes(cn));
      });
      if (parcial) return parcial;
    }
  }
  return null;
}
async function extrairPedidoDaConversa(){
  const texto = document.getElementById('imp-conversa-texto').value.trim();
  if (!texto){ showToast('Cole a conversa primeiro'); return; }

  appConfig = loadO(K.C);
  const apiKey = appConfig.geminiApiKey;
  if (!apiKey){
    showToast('Configure a chave da API do Gemini em Configurações primeiro.');
    closeModal('modal-importar-conversa');
    showApiKeyConfig();
    return;
  }

  document.getElementById('imp-loading').style.display = 'block';
  document.getElementById('imp-extrair-btn').disabled = true;

  const hoje = todayStr();
  const prompt = `Você lê conversas de WhatsApp entre uma confeiteira/papelaria personalizada ("Graça em Papel") e seus clientes, e extrai os dados do pedido combinado.

Data de hoje: ${hoje} (use isso para resolver datas relativas como "dia 15", "próxima sexta", "semana que vem" etc — assuma a próxima ocorrência futura dessa data).

Responda APENAS com um JSON válido (sem markdown, sem texto extra) no seguinte formato:
{
  "nome": "nome do cliente, ou null se não identificado",
  "whatsapp": "telefone do cliente se aparecer na conversa, apenas números, ou null",
  "produtos": "resumo curto dos produtos/itens combinados, ou null",
  "valorTotal": número (valor total combinado) ou null,
  "valorPago": número (valor de sinal/pagamento já recebido, se mencionado) ou null,
  "dataEvento": "YYYY-MM-DD ou null (data da festa/evento em si, se diferente da entrega)",
  "dataEntrega": "YYYY-MM-DD ou null (data em que o pedido deve ficar pronto/ser entregue)",
  "observacoes": "outros detalhes relevantes combinados (cores, tema, quantidade, tamanho etc), ou null"
}

Conversa:
"""
${texto}
"""`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('Erro na API: ' + (data?.error?.message || res.status));
      return;
    }
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) { showToast('A IA não retornou dados. Tente novamente.'); return; }
    let extraido;
    try { extraido = JSON.parse(raw); }
    catch { showToast('Não foi possível interpretar a resposta da IA.'); return; }

    preencherRevisaoImportacao(extraido);
  } catch(e) {
    showToast('Erro ao conectar com a IA. Verifique sua chave e conexão.');
  } finally {
    document.getElementById('imp-loading').style.display = 'none';
    document.getElementById('imp-extrair-btn').disabled = false;
  }
}
function preencherRevisaoImportacao(ex){
  document.getElementById('imp-nome').value         = ex.nome || '';
  document.getElementById('imp-whatsapp').value      = ex.whatsapp || '';
  document.getElementById('imp-produtos').value      = ex.produtos || '';
  document.getElementById('imp-valor-total').value   = ex.valorTotal ?? '';
  document.getElementById('imp-valor-pago').value    = ex.valorPago ?? '';
  document.getElementById('imp-data-evento').value   = ex.dataEvento || '';
  document.getElementById('imp-data-entrega').value  = ex.dataEntrega || '';
  document.getElementById('imp-obs').value           = ex.observacoes || '';

  _importCliMatch = encontrarClienteMatch(ex.nome, ex.whatsapp);
  const matchEl = document.getElementById('imp-cliente-match');
  if (_importCliMatch) {
    matchEl.innerHTML = `
      <div class="card" style="background:var(--blue-pale);border:none;box-shadow:none;padding:12px 14px;margin:0">
        <div style="font-size:12px;color:var(--blue-deep);line-height:1.5">
          ✅ Cliente já cadastrado encontrado: <b>${_importCliMatch.nome}</b>${_importCliMatch.whatsapp?' · '+_importCliMatch.whatsapp:''}<br>
          Este pedido será vinculado ao cadastro dele.
        </div>
      </div>`;
    // Usa os dados oficiais do cadastro quando disponíveis
    document.getElementById('imp-nome').value = _importCliMatch.nome || document.getElementById('imp-nome').value;
    if (_importCliMatch.whatsapp) document.getElementById('imp-whatsapp').value = _importCliMatch.whatsapp;
  } else {
    matchEl.innerHTML = `
      <div class="card" style="background:var(--rose-pale);border-color:var(--rose-light);padding:12px 14px;margin:0">
        <div style="font-size:12px;color:var(--rose-dark);line-height:1.5">
          ⚠️ Não encontramos um cliente cadastrado com esse nome/WhatsApp. O pedido será criado sem vínculo — você pode cadastrar o cliente depois em "Clientes".
        </div>
      </div>`;
  }

  document.getElementById('imp-passo-colar').style.display = 'none';
  document.getElementById('imp-passo-revisao').style.display = 'block';
}
function aplicarImportacaoAoPedido(){
  const nome = document.getElementById('imp-nome').value.trim();
  if (!nome) { showToast('Informe ao menos o nome do cliente'); return; }

  document.getElementById('p-nome').value         = nome;
  document.getElementById('p-whatsapp').value     = document.getElementById('imp-whatsapp').value.trim();
  document.getElementById('p-produtos').value     = document.getElementById('imp-produtos').value.trim();
  const vt = parseFloat(document.getElementById('imp-valor-total').value);
  const vp = parseFloat(document.getElementById('imp-valor-pago').value);
  document.getElementById('p-total').value        = isNaN(vt) ? '' : vt;
  document.getElementById('p-pago').value         = isNaN(vp) ? '' : vp;
  document.getElementById('p-data-evento').value  = document.getElementById('imp-data-evento').value;
  document.getElementById('p-data-entrega').value = document.getElementById('imp-data-entrega').value;
  const obsImportada = document.getElementById('imp-obs').value.trim();
  if (obsImportada) {
    const obsAtual = document.getElementById('p-obs').value.trim();
    document.getElementById('p-obs').value = obsAtual ? obsAtual + '\n' + obsImportada : obsImportada;
  }
  calcPendente();

  if (_importCliMatch) {
    populateClienteSelectPedido(_importCliMatch.id);
    document.getElementById('p-cliente-id').value = _importCliMatch.id;
  }

  closeModal('modal-importar-conversa');
  showToast(_importCliMatch ? 'Dados importados e vinculados ao cliente!' : 'Dados importados. Revise antes de salvar.');
}
