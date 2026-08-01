# Graça em Papel · Central de Gestão

App web (PWA) de página única para gerenciar pedidos, clientes, produtos, materiais/estoque, financeiro, vendas e agenda de uma loja de papelaria/artesanato. Inclui um assistente e análises geradas por IA (Gemini) e upload de fotos (Cloudinary), com sincronização em nuvem via Firebase Firestore.

## Estrutura do projeto

```
index.html       HTML + CSS (estilo e telas) + tags <script> que carregam os módulos
js/
  firebase.js    Inicialização do Firestore e funções de sincronização (window.fb*)
  data.js        Estado global, persistência (localStorage), sessão/login e cálculos de negócio
  ia.js          Integrações com IA (Gemini) e Cloudinary: análise de clientes, assistente de chat,
                 importação de pedido a partir de conversa, upload de foto
  ui.js          Navegação entre telas, renderização de cada tela, modais e inicialização do app
```

Não há build step (webpack/vite/etc.) — os arquivos `.js` são carregados como `<script>` simples e o `firebase.js` como `<script type="module">`, exatamente como no HTML original. Isso significa que **todo o estado e as funções continuam sendo globais**, compartilhados entre os 4 arquivos (mesmo comportamento de antes da divisão, só que organizado em arquivos por responsabilidade).

### Ordem de carregamento

No `index.html`:
1. `js/firebase.js` (`<head>`, `type="module"` — carrega de forma assíncrona/deferred)
2. HTML das telas e modais
3. `js/data.js`, `js/ia.js`, `js/ui.js` (final do `<body>`, nessa ordem)

A ordem entre `data.js`/`ia.js`/`ui.js` não é estritamente obrigatória (funções são "hoisted" e só são chamadas depois que a página termina de carregar), mas `data.js` deve continuar vindo primeiro por convenção, já que define o estado (`K`, `load`/`save`, `appConfig` etc.) usado pelos outros dois.

## Onde mexer

- **Nova tela ou novo elemento visual** → `js/ui.js` (funções `render*`, `open*Modal`, `navigate`)
- **Novo campo de dado, cálculo de custo/lucro/estoque, chave de persistência** → `js/data.js`
- **Qualquer coisa envolvendo Gemini, chat, análise de cliente ou upload de imagem** → `js/ia.js`
- **Sincronização com o Firestore** → `js/firebase.js`

## Rodando localmente

Como `firebase.js` usa `import` (ES module), abrir `index.html` direto pelo `file://` não funciona — o navegador bloqueia módulos ES nesse esquema. Sirva a pasta por HTTP:

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000/index.html
```

## Dados e sincronização

- Tudo é salvo primeiro no `localStorage` do navegador (chaves com prefixo `cdg_`, ver objeto `K` em `js/data.js`) e replicado para coleções no Firestore (ver `COL_MAP`).
- No boot, se já houver sessão salva, o app sincroniza do Firestore (fonte da verdade) por cima do `localStorage`.
- Enquanto o Firestore ainda não carregou, os `save()` ficam numa fila (`_saveQueue`) e são reenviados assim que `window.onFbReady` dispara.

## Configuração (dentro do próprio app, tela "Config")

- **Chave de API do Gemini**: cada usuário cola a própria chave, guardada em `appConfig.geminiApiKey` (usada pelo `ia.js` para as chamadas ao Gemini).
- **Cloudinary**: upload de fotos usa um cloud name fixo (`dl1vymhde`) já embutido em `js/ia.js`.

## Aviso de segurança importante

O login (`doLogin` em `js/data.js`) é **apenas cosmético no cliente** — a senha fica em texto plano no código-fonte (`USERS` / `senhaCustom`) e não há Firebase Authentication configurado (comentário original: "Firestore only, sem Auth"). Isso quer dizer que a proteção real dos dados depende inteiramente das **regras de segurança do Firestore no console do Firebase** — sem regras restritivas lá, qualquer pessoa pode ler/escrever a base direto pela API, ignorando essa tela de login. Antes de tratar este app como seguro para dados sensíveis de clientes, revise/configure Firebase Authentication + regras do Firestore.

## Limitações conhecidas / próximos passos sugeridos

- Sem testes automatizados e sem build — qualquer mudança deve ser validada manualmente no navegador.
- Tratamento de erro é raso em várias chamadas assíncronas (`.catch(()=>{})`), falhas de sync/IA podem passar silenciosas.
- Sem paginação/lazy-render nas listas (pedidos, clientes) — pode ficar lento com muitos registros.
