/* firebase.js — inicialização do Firestore e funções de sincronização (fbSaveCollection, fbDeleteDoc, fbLoadCollection, fbSyncOnBoot) expostas em window.* para uso pelos demais módulos */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBdoXn-ECybMDTL-DvRWr7m3ZCkHhGpJC8",
  authDomain:        "tudo-pela-graca-loja.firebaseapp.com",
  projectId:         "tudo-pela-graca-loja",
  storageBucket:     "tudo-pela-graca-loja.firebasestorage.app",
  messagingSenderId: "879019608533",
  appId:             "1:879019608533:web:d211d3a889f980c2f0955c"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

window.fbSaveCollection = async function(colName, items) {
  if (!items || !Array.isArray(items)) return;
  for (const item of items) {
    if (!item.id) continue;
    await setDoc(doc(db, colName, String(item.id)), item);
  }
};

window.fbDeleteDoc = async function(colName, id) {
  await deleteDoc(doc(db, colName, String(id)));
};

window.fbLoadCollection = async function(colName) {
  const snap = await getDocs(collection(db, colName));
  return snap.docs.map(d => d.data());
};

window.fbSyncOnBoot = async function() {
  try {
    const cols = { cdg_pedidos:'pedidos', cdg_receitas:'receitas', cdg_despesas:'despesas', cdg_vendas:'vendas', cdg_materiais:'materiais', cdg_produtos:'produtos_catalogo', cdg_estoque_mov:'estoque_movimentacoes', cdg_clientes:'clientes', cdg_chat_hist:'chat_historico' };
    for (const [lsKey, colName] of Object.entries(cols)) {
      const items = await window.fbLoadCollection(colName);
      // Sempre sobrescreve o localStorage com os dados do Firestore (fonte da verdade)
      localStorage.setItem(lsKey, JSON.stringify(items));
    }
    // cdg_ia_perfis é um objeto (chave = cliente), não um array, então precisa de conversão à parte
    try {
      const iaItems = await window.fbLoadCollection('ia_perfis');
      const iaMap = {};
      iaItems.forEach(it => { if (it && it.id) { const { id, ...rest } = it; iaMap[id] = rest; } });
      localStorage.setItem('cdg_ia_perfis', JSON.stringify(iaMap));
    } catch(e) { console.warn('Erro ao sincronizar perfis de IA:', e); }
  } catch(e) { console.warn('Firestore sync error:', e); }
};

// Sinaliza que o Firestore está pronto
window.FB = { ready: true };
if (window.onFbReady) window.onFbReady();
window.dispatchEvent(new Event('fb-ready'));
