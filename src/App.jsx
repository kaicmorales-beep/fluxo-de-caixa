// ============================================================
// FLUXO DE CAIXA — React para Lovable + Supabase + Google Auth
// Cole este arquivo inteiro no editor do Lovable
// ============================================================
import { useState, useEffect, useCallback } from "react";
import Assistente from "./components/Assistente.jsx";
import { createClient } from "@supabase/supabase-js";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import ReactMarkdown from "react-markdown";

// ── SUPABASE CONFIG ──────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── CONSTANTES ───────────────────────────────────────────────
const ANOS_CONFIG = {
  2026: ["Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
  2027: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
};

const DEF_CATS = () => [
  { id:"cartao",   nome:"Cartão de crédito", cor:"#c0392b", contas:[] },
  { id:"contab",   nome:"Contabilidade",     cor:"#d67e20", contas:[] },
  { id:"imposto",  nome:"Impostos",          cor:"#8e44ad", contas:[] },
  { id:"salarios", nome:"Salários",          cor:"#1a5fa0", contas:[] },
  { id:"cursos",   nome:"Cursos",            cor:"#1a7a4a", contas:[] },
];

function defAno(ano) {
  const n = ANOS_CONFIG[ano].length;
  if (ano === 2026) return {
    caixaInicial: 1000,
    gastosPessoal: [0,    5500,5300,5300,5200,4200,4200,4200,4200],
    gastosEmpresa: [0,    2000,2000,2000,2000,1500,1500,1500,1500],
    banda:         [0,    1050,1750,1400,1400,1750,1400,2450,1500],
    clientes: [],
    categorias: DEF_CATS(),
  };
  return {
    caixaInicial: 0,
    gastosPessoal: Array(n).fill(0),
    gastosEmpresa: Array(n).fill(0),
    banda: Array(n).fill(0),
    clientes: [],
    categorias: DEF_CATS(),
  };
}

// ── HELPERS ──────────────────────────────────────────────────
function fmt(v) {
  const n = Math.round(v);
  return (n < 0 ? "-" : "") + "R$" + Math.abs(n).toLocaleString("pt-BR");
}
function cc(v) { return v > 50 ? "pos" : v < 0 ? "neg" : "neu"; }

const N_2026 = ANOS_CONFIG[2026].length; // 9 meses (Abril-Dezembro)

function gastosEmpMes(d, ano, prevD = null) {
  const ms = ANOS_CONFIG[ano];
  const offset = ano === 2027 ? N_2026 : 0; // índice global do 1º mês do ano

  return ms.map((_, i) => {
    const gI = i + offset; // índice global deste mês

    // Contas do ano atual
    let soma = d.categorias.reduce((acc, cat) =>
      acc + cat.contas.reduce((a, ct) => {
        const gIni = parseInt(ct.inicio) + offset;
        const par = parseInt(ct.parcelas);
        if (gI < gIni || (par !== 0 && (gI - gIni) >= par)) return a;
        return a + valEff(ct, i);
      }, 0), 0);

    // Carryover: contas parceladas de 2026 que transbordam para 2027
    if (prevD && ano === 2027) {
      prevD.categorias.forEach(cat => {
        cat.contas.forEach(ct => {
          const gIni = parseInt(ct.inicio); // 2026: local = global
          const par = parseInt(ct.parcelas), val = parseFloat(ct.valor) || 0;
          if (par === 0) return; // recorrentes são definidos por ano
          if (gI >= gIni && (gI - gIni) < par) soma += val;
        });
      });
    }

    return soma;
  });
}

// Valor efetivo de um item (conta/cliente) num mês: usa override do mês se houver, senão o valor base
function valEff(item, mi) {
  const o = item && item.valorMes ? item.valorMes[mi] : undefined;
  return (o !== undefined && o !== null) ? (parseFloat(o) || 0) : (parseFloat(item.valor) || 0);
}
// Aplica um novo valor a partir de um mês. scope: "mes" = só este mês | "frente" = deste mês em diante (preserva anteriores)
function applyValor(item, scope, mi, newVal, msLen) {
  if (!item.valorMes) item.valorMes = {};
  if (scope === "mes") { item.valorMes[mi] = newVal; return; }
  const ini = parseInt(item.inicio) || 0, par = parseInt(item.parcelas) || 0;
  const oldBase = parseFloat(item.valor) || 0;
  // fixa meses anteriores ativos no valor antigo (preserva o passado)
  for (let k = ini; k < mi; k++) {
    const ativo = k >= ini && (par === 0 || (k - ini) < par);
    if (ativo && (item.valorMes[k] === undefined || item.valorMes[k] === null)) item.valorMes[k] = oldBase;
  }
  // do mês atual em diante segue o novo valor base → limpa overrides futuros
  for (let k = mi; k < msLen; k++) delete item.valorMes[k];
  item.valor = newVal;
}

// ── PRODUTOS CONTRATADOS POR CLIENTE ─────────────────────────
// Cada cliente pode ter produtos contratados (valor mensal + início + duração).
// Quando existem, ELES definem a receita mensal do cliente; sem produtos,
// vale o cadastro legado (valor único + início + parcelas).
function prodAtivoMes(p, mi) {
  const ini = parseInt(p.inicio)||0, par = parseInt(p.parcelas)||0;
  return mi >= ini && (par === 0 || (mi - ini) < par);
}
function cliValMes(c, mi) {
  const pr = c.produtosContratados;
  if (Array.isArray(pr) && pr.length) return pr.reduce((a,p)=>a+(prodAtivoMes(p,mi)?(parseFloat(p.valor)||0):0),0);
  const ini = parseInt(c.inicio), par = parseInt(c.parcelas);
  return (mi >= ini && (par === 0 || (mi - ini) < par)) ? valEff(c, mi) : 0;
}
function cliAtivoMes(c, mi) {
  const pr = c.produtosContratados;
  if (Array.isArray(pr) && pr.length) return pr.some(p=>prodAtivoMes(p,mi));
  const ini = parseInt(c.inicio), par = parseInt(c.parcelas);
  return mi >= ini && (par === 0 || (mi - ini) < par);
}

function cliMes(d, ano) {
  const n = ANOS_CONFIG[ano].length;
  const a = Array(n).fill(0);
  d.clientes.forEach(c => {
    if (c.status !== "ativo") return;
    for (let i = 0; i < n; i++) a[i] += cliValMes(c, i);
  });
  return a;
}

function calcFlow(d, ano, caixaOverride = null, prevD = null) {
  const ms = ANOS_CONFIG[ano];
  const ge = gastosEmpMes(d, ano, prevD);
  const cm = cliMes(d, ano);
  let cx = caixaOverride !== null ? caixaOverride : d.caixaInicial;
  return ms.map((mes, i) => {
    const gp = d.gastosPessoal[i] || 0;
    const gastos = gp + ge[i];
    const ba = d.banda[i] || 0, cl = cm[i] || 0;
    const entradas = ba + cl;
    const saldo = entradas - gastos;
    cx += saldo;
    return { mes, i, gp, ge: ge[i], gastos, ba, cl, entradas, saldo, caixa: cx };
  });
}

// ── PAINEL DE CLIENTES (CRM) ─────────────────────────────────
// Semáforo financeiro (manual nesta fase; Asaas fica para fase 2)
const FIN_OPTS = [
  { v:"em_dia",       dot:"🟢", lbl:"Em dia",        cor:"#1a6e1a", bg:"#eaf4ea" },
  { v:"vence_breve",  dot:"🟡", lbl:"Vence em breve", cor:"#8a5c00", bg:"#fdf6e8" },
  { v:"inadimplente", dot:"🔴", lbl:"Inadimplente",   cor:"#b03030", bg:"#fdf0f0" },
  { v:"manual",       dot:"⚪", lbl:"Controle manual", cor:"#888780", bg:"#f0efeb" },
];
const SAUDE_OPTS = [
  { v:"saudavel", dot:"🟢", lbl:"Saudável", cor:"#1a6e1a", bg:"#eaf4ea" },
  { v:"atencao",  dot:"🟡", lbl:"Atenção",  cor:"#8a5c00", bg:"#fdf6e8" },
  { v:"risco",    dot:"🔴", lbl:"Risco",    cor:"#b03030", bg:"#fdf0f0" },
];
const TEMP_OPTS = [
  { v:"muito_satisfeito", emoji:"🔥", lbl:"Muito satisfeito" },
  { v:"satisfeito",       emoji:"😊", lbl:"Satisfeito" },
  { v:"neutro",           emoji:"😐", lbl:"Neutro" },
  { v:"insatisfeito",     emoji:"😕", lbl:"Insatisfeito" },
  { v:"risco_cancel",     emoji:"🚨", lbl:"Risco de cancelamento" },
];
const findOpt = (arr, v) => arr.find(o => o.v === v) || null;

// Limiares dos alertas automáticos
const ALERTA_VENCE_DIAS    = 5;   // pagamento vence em X dias
const ALERTA_RENOVA_DIAS   = 30;  // contrato renova em X dias
const ALERTA_SEM_REUNIAO   = 30;  // sem reunião há X dias
const ALERTA_SEM_ATUALIZ   = 14;  // sem atualização há X dias

function diasEntre(dataISO, hoje) {
  if (!dataISO) return null;
  const d = new Date(dataISO + "T00:00:00");
  if (isNaN(d)) return null;
  return Math.round((d - hoje) / 86400000); // >0 futuro, <0 passado
}

// Gera os alertas automáticos a partir da receita + dados de CRM
function computeAutoAlerts(crm, hoje) {
  const out = [];
  const fin = crm.statusFinanceiro;
  if (fin === "inadimplente") out.push({ level:"danger", text:"Pagamento vencido" });
  const dVenc = diasEntre(crm.proximoVencimento, hoje);
  if (dVenc !== null) {
    if (dVenc < 0 && fin !== "inadimplente") out.push({ level:"danger", text:`Vencimento atrasado há ${Math.abs(dVenc)}d` });
    else if (dVenc >= 0 && dVenc <= ALERTA_VENCE_DIAS) out.push({ level:"warn", text:`Vence em ${dVenc}d` });
  }
  const dRenova = diasEntre(crm.dataRenovacao, hoje);
  if (dRenova !== null && dRenova >= 0 && dRenova <= ALERTA_RENOVA_DIAS) out.push({ level:"warn", text:`Contrato renova em ${dRenova}d` });
  const dReuniao = diasEntre(crm.ultimaReuniao, hoje);
  if (dReuniao !== null && -dReuniao >= ALERTA_SEM_REUNIAO) out.push({ level:"warn", text:`Sem reunião há ${-dReuniao}d` });
  const ultHist = (crm.historico && crm.historico.length) ? crm.historico[0].data : null;
  const dHist = diasEntre(ultHist, hoje);
  if (dHist !== null && -dHist >= ALERTA_SEM_ATUALIZ) out.push({ level:"info", text:`Sem atualização há ${-dHist}d` });
  // Alertas manuais
  if (crm.saude === "risco") out.push({ level:"danger", text:"Conta marcada como risco" });
  if (crm.temperatura === "risco_cancel") out.push({ level:"danger", text:"Risco de cancelamento" });
  if (crm.temperatura === "insatisfeito") out.push({ level:"warn", text:"Cliente insatisfeito" });
  (crm.alertasManuais || []).forEach(t => t && out.push({ level:"warn", text:t }));
  return out;
}

// ── SUPABASE DATA LAYER ──────────────────────────────────────
async function loadFromDB(userId, ano) {
  const { data, error } = await supabase
    .from("fluxo_dados")
    .select("dados")
    .eq("user_id", userId)
    .eq("ano", ano)
    .single();
  if (error || !data) return defAno(ano);
  try {
    const d = data.dados;
    const n = ANOS_CONFIG[ano].length;
    ["gastosPessoal","gastosEmpresa","banda"].forEach(k => {
      if (!Array.isArray(d[k])) d[k] = Array(n).fill(0);
      while (d[k].length < n) d[k].push(0);
    });
    if (!d.clientes) d.clientes = [];
    // Garante um id estável por receita (usado para pendurar dados de CRM no painel)
    d.clientes.forEach(c => { if (!c.id) c.id = "cli_" + Math.random().toString(36).slice(2) + Date.now().toString(36); });
    if (!d.categorias) d.categorias = DEF_CATS();
    d.categorias.forEach(c => { if (!c.contas) c.contas = []; });
    return d;
  } catch { return defAno(ano); }
}

async function saveToDB(userId, ano, dados) {
  const { error } = await supabase.from("fluxo_dados").upsert(
    { user_id: userId, ano, dados, updated_at: new Date().toISOString() },
    { onConflict: "user_id,ano" }
  );
  if (error) {
    console.error("[fluxo-caixa] Erro ao salvar:", error);
    throw error;
  }
}

async function loadKanbanFromDB(userId) {
  const { data, error } = await supabase
    .from("fluxo_dados")
    .select("dados")
    .eq("user_id", userId)
    .eq("ano", 0)
    .single();
  if (error || !data) return { leads: [], crm: {}, categoriasAnalise: [], produtos: [] };
  try {
    const d = data.dados;
    if (!Array.isArray(d.leads)) d.leads = [];
    if (!d.crm || typeof d.crm !== "object") d.crm = {};
    if (!Array.isArray(d.categoriasAnalise)) d.categoriasAnalise = [];
    if (!Array.isArray(d.produtos)) d.produtos = [];
    return d;
  } catch { return { leads: [], crm: {}, categoriasAnalise: [], produtos: [] }; }
}

// ── STYLES ───────────────────────────────────────────────────
const S = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  :root {
    --bg:#f7f7f5;--white:#fff;--surface:#f0efeb;--border:#e2e1db;--border2:#d0cfc8;
    --text:#1a1a18;--muted:#888780;--muted2:#b4b2a9;
    --green:#2d6a2d;--green-bg:#eaf4ea;--green-dark:#1e4a1e;
    --red:#b03030;--red-bg:#fdf0f0;
    --warn:#8a5c00;--warn-bg:#fdf6e8;
    --mono:'JetBrains Mono',monospace;--sans:'Inter',sans-serif;--r:10px;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.5}
  input,select,button{font-family:var(--sans)}
  .pos{color:#1a6e1a}.neg{color:var(--red)}.neu{color:var(--warn)}.dim{color:var(--muted2)}

  /* TOPBAR */
  .topbar{background:var(--white);border-bottom:1px solid var(--border);height:52px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;gap:12px}
  .brand{font-size:15px;font-weight:600;letter-spacing:-.01em;white-space:nowrap}
  .hdr-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .hdr-stats{display:flex;gap:16px}
  .hdr-stat{display:flex;flex-direction:column;align-items:flex-end}
  .hdr-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
  .hdr-val{font-size:15px;font-weight:600;font-family:var(--mono)}
  .yr-sw{display:flex;border:1px solid var(--border2);border-radius:7px;overflow:hidden}
  .yr-btn{padding:5px 13px;font-size:12px;font-weight:500;cursor:pointer;border:none;background:transparent;color:var(--muted);transition:all .12s}
  .yr-btn.on{background:var(--green);color:#fff}
  .user-chip{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
  .avatar{width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid var(--border)}
  .avatar-fallback{width:28px;height:28px;border-radius:50%;background:var(--green-bg);color:var(--green-dark);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:1px solid var(--border)}

  /* LAYOUT + SIDEBAR */
  .layout{display:flex;align-items:stretch;min-height:calc(100vh - 52px)}
  .sidebar{width:190px;flex-shrink:0;background:var(--white);border-right:1px solid var(--border);padding:10px 8px;display:flex;flex-direction:column;gap:2px;position:sticky;top:52px;height:calc(100vh - 52px);overflow-y:auto;overflow-x:hidden;transition:width .18s ease}
  .sidebar.closed{width:52px}
  .sb-toggle{display:flex;align-items:center;justify-content:center;border:1px solid var(--border2);background:var(--white);color:var(--muted);border-radius:7px;cursor:pointer;font-size:12px;padding:6px;margin-bottom:8px;transition:all .12s}
  .sb-toggle:hover{border-color:var(--green);color:var(--green)}
  .sb-item{display:flex;align-items:center;gap:9px;padding:9px 10px;border:none;background:none;border-radius:7px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;transition:background .12s,color .12s}
  .sb-item:hover{background:var(--surface);color:var(--text)}
  .sb-item.on{background:var(--green-bg);color:var(--green-dark);font-weight:600}
  .sb-ico{font-size:16px;flex-shrink:0;width:20px;text-align:center}
  .sb-lbl{overflow:hidden;text-overflow:ellipsis}

  /* CONTENT */
  .content{padding:20px;width:100%;min-width:0;box-sizing:border-box}

  /* CARDS */
  .card{background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:16px}
  .cards-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px}
  .stat-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
  .stat-val{font-size:20px;font-weight:600;font-family:var(--mono);letter-spacing:-.02em}
  .stat-sub{font-size:11px;color:var(--muted);margin-top:2px}

  /* ALERT */
  .alert{border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;display:flex;align-items:flex-start;gap:8px;line-height:1.5}
  .a-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;margin-top:4px}
  .alert.danger{background:var(--red-bg);color:var(--red);border:1px solid #e0b0b0}
  .alert.warn{background:var(--warn-bg);color:var(--warn);border:1px solid #e0c880}
  .alert.ok{background:var(--green-bg);color:var(--green-dark);border:1px solid #b0d4b0}
  .alert.info{background:#eef4fb;color:#1a4a7a;border:1px solid #b0ccee}

  /* TABLE */
  .tbl-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--r);background:var(--white);margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  thead th{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:9px 10px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap;background:var(--surface)}
  thead th:first-child{text-align:left}
  tbody td{border-bottom:1px solid var(--border);padding:0;vertical-align:middle}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover td{background:#fafaf8}
  .td-m{padding:10px 11px;font-weight:600;font-size:13px;white-space:nowrap}
  .td-n{font-family:var(--mono);font-size:12px;text-align:right;padding:9px 10px;white-space:nowrap}
  .td-s{font-family:var(--mono);font-size:13px;font-weight:600;text-align:right;padding:10px;white-space:nowrap}
  .ed-inp{background:transparent;border:none;font-family:var(--mono);font-size:12px;text-align:right;width:100%;padding:9px 10px;outline:none;color:var(--text);min-width:80px}
  .ed-inp:focus{background:#f0f8f0;color:#1a6e1a}

  /* BUTTONS */
  .btn{display:inline-flex;align-items:center;gap:5px;padding:8px 14px;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid var(--border2);background:var(--white);color:var(--text);transition:all .12s}
  .btn:hover{border-color:var(--green);color:var(--green)}
  .btn-p{background:var(--green);color:#fff;border-color:var(--green)}
  .btn-p:hover{background:#245724;color:#fff}
  .btn-sm{padding:5px 10px;font-size:12px}
  .btn-rm{border:none;background:none;color:var(--muted2);cursor:pointer;font-size:17px;padding:0 5px;line-height:1}
  .btn-rm:hover{color:var(--red)}
  .btn-ghost{border:none;background:none;color:var(--muted);cursor:pointer;font-size:13px;padding:6px 10px}
  .btn-ghost:hover{color:var(--red)}

  /* FORM */
  .form-wrap{background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:16px}
  .fg{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}
  .fl{display:flex;flex-direction:column;gap:4px}
  .flabel{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
  .fi{background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:8px 10px;font-size:13px;color:var(--text);outline:none;transition:border .12s;width:100%}
  .fi:focus{border-color:var(--green);background:var(--white)}

  /* CLI CARD */
  .cli-list{display:flex;flex-direction:column;gap:8px}
  .cli-card{background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:13px 15px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
  /* Linha compacta (Receitas) */
  .cli-list.compact{gap:5px}
  .cli-row{background:var(--white);border:1px solid var(--border);border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:10px}
  .cli-row:hover{background:#fafaf8}
  .rec-chk{width:16px;height:16px;cursor:pointer;flex-shrink:0;accent-color:var(--green)}
  .cli-row-main{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;overflow:hidden}
  .cli-row-nome{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cli-row-sub{font-size:11px;color:var(--muted);white-space:nowrap}
  .cli-row-actions{display:flex;gap:6px;align-items:center;flex-shrink:0}
  .val-edit{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
  .val-in{width:84px;border:1px solid var(--green);border-radius:6px;padding:4px 7px;font-size:12px;font-family:var(--mono);text-align:right;outline:none;background:#f0f8f0}
  .rec-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:10px}
  .rec-bar-chk{display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer;user-select:none}
  .badge{font-size:11px;font-weight:500;padding:3px 8px;border-radius:20px;white-space:nowrap}
  .b-g{background:var(--green-bg);color:var(--green-dark)}
  .b-gray{background:var(--surface);color:var(--muted)}
  .pill-tog{font-size:11px;font-weight:600;padding:3px 11px;border-radius:20px;cursor:pointer;white-space:nowrap;transition:all .12s}
  .pill-tog.on{background:var(--green-bg);color:var(--green-dark);border:1px solid #b0d4b0}
  .pill-tog.off{background:#fdf6e8;color:#8a5c00;border:1px solid #e0c880}
  .pill-tog:hover{filter:brightness(.97)}
  .b-w{background:var(--warn-bg);color:var(--warn)}
  .par-row{display:flex;gap:3px;margin-top:5px;flex-wrap:wrap}
  .par-dot{width:9px;height:9px;border-radius:2px}

  /* EMPRESA */
  .emp-sec{background:var(--white);border:1px solid var(--border);border-radius:var(--r);margin-bottom:10px;overflow:hidden}
  .emp-sec-hdr{padding:12px 15px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);background:var(--surface);cursor:pointer;user-select:none}
  .emp-sec-right{display:flex;align-items:center;gap:10px}
  .conta-head-row{display:flex;background:var(--surface);border-bottom:1px solid var(--border)}
  .conta-head-label{flex:1;padding:7px 12px;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
  .conta-head-col{width:76px;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;text-align:right;padding:7px 8px}
  .conta-row{display:flex;align-items:center;border-bottom:1px solid var(--border)}
  .conta-row:last-child{border-bottom:none}
  .conta-nome{flex:1;padding:9px 12px;font-size:13px;display:flex;align-items:center;gap:6px}
  .conta-vals{display:flex}
  .conta-val-cell{width:76px;font-family:var(--mono);font-size:12px;text-align:right;padding:9px 8px;white-space:nowrap}

  /* DASH TABLE */
  .dash-tbl-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--r);background:var(--white);margin-bottom:16px}
  .dash-tbl{width:100%;border-collapse:collapse;font-size:12px}
  .dash-tbl th{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:8px 9px;text-align:right;border-bottom:1px solid var(--border);background:var(--surface);white-space:nowrap}
  .dash-tbl th:first-child{text-align:left;min-width:160px;position:sticky;left:0;background:var(--surface)}
  .dash-tbl td{padding:8px 9px;border-bottom:1px solid var(--border);text-align:right;font-family:var(--mono);font-size:12px;white-space:nowrap}
  .dash-tbl td:first-child{text-align:left;font-family:var(--sans);font-size:13px;font-weight:500;position:sticky;left:0;background:var(--white)}
  .dash-tbl .spec-row td{background:var(--surface);font-weight:600}
  .dash-tbl .spec-row td:first-child{background:var(--surface)}
  .cat-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}

  /* META */
  .meta-bg{background:var(--surface);border-radius:4px;height:5px;overflow:hidden;margin:6px 0 3px}
  .meta-fill{height:100%;border-radius:4px;transition:width .6s;background:var(--green)}

  /* CARRY */
  .carry-banner{background:#eef4fb;border:1px solid #b0ccee;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#1a4a7a;display:flex;align-items:center;gap:8px}

  /* SEC */
  .sec-label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;margin-top:22px}
  .sec-label:first-child{margin-top:0}
  .pg-title{font-size:17px;font-weight:600;margin-bottom:3px}
  .pg-sub{font-size:13px;color:var(--muted);margin-bottom:20px}
  hr.dv{border:none;border-top:1px solid var(--border);margin:18px 0}

  /* SAVING indicator */
  .saving-dot{width:7px;height:7px;border-radius:50%;background:var(--muted2);display:inline-block;margin-left:6px;transition:background .3s}
  .saving-dot.saving{background:#f0c97a}
  .saving-dot.saved{background:#1a6e1a}
  .saving-dot.error{background:var(--red)}
  .save-err{font-size:11px;color:var(--red);margin-left:6px;font-weight:500}

  /* LOGIN */
  .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}
  .login-box{background:var(--white);border:1px solid var(--border);border-radius:16px;padding:40px;max-width:380px;width:90%;text-align:center}
  .login-title{font-size:22px;font-weight:600;margin-bottom:8px}
  .login-sub{font-size:14px;color:var(--muted);margin-bottom:32px;line-height:1.6}
  .google-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px 20px;border-radius:9px;border:1px solid var(--border2);background:var(--white);font-size:14px;font-weight:500;color:var(--text);cursor:pointer;transition:all .15s}
  .google-btn:hover{border-color:var(--green);background:var(--green-bg)}
  .google-icon{width:20px;height:20px}

  /* EDIT MODAL (80% da tela) */
  .edit-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:250;display:flex;align-items:center;justify-content:center;padding:20px}
  .edit-modal{width:80vw;height:80vh;max-width:1100px;background:var(--bg);border-radius:14px;overflow-y:auto;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.28);animation:dwin .16s ease;display:flex;flex-direction:column}
  .edit-modal .form-wrap{margin-bottom:0}
  .edit-modal-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
  .edit-modal-title{font-size:17px;font-weight:600}

  /* MODAL */
  .modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:100;display:flex;align-items:center;justify-content:center}
  .modal-box{background:var(--white);border-radius:14px;padding:28px;max-width:400px;width:92%}
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(10px);background:#1a1a18;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500;z-index:300;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

  @media(max-width:900px){
    .hdr-stats{display:none}
    .content{padding:12px}
    .topbar{padding:0 12px;gap:8px}
    thead th{padding:7px 6px;font-size:9px}
    .td-m{padding:8px 8px;font-size:12px}
    .td-n{padding:8px 6px;font-size:11px}
    .td-s{padding:8px 6px;font-size:12px}
    .ed-inp{padding:8px 6px;min-width:60px;font-size:11px}
  }
  @media(max-width:600px){
    .content{padding:8px}
    .topbar{height:44px}
    .layout{min-height:calc(100vh - 44px)}
    .sidebar{top:44px;height:calc(100vh - 44px)}
  }

  /* KANBAN */
  .kanban-board{display:flex;gap:14px;overflow-x:auto;padding-bottom:12px;align-items:flex-start;min-height:400px}
  .kanban-board::-webkit-scrollbar{height:6px}
  .kanban-board::-webkit-scrollbar-track{background:var(--surface);border-radius:3px}
  .kanban-board::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
  .kanban-col{min-width:220px;max-width:220px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);display:flex;flex-direction:column;gap:0;overflow:hidden;flex-shrink:0}
  .kanban-col-hdr{padding:10px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
  .kanban-col-title{font-size:12px;font-weight:600;letter-spacing:.04em}
  .kanban-col-count{font-size:11px;background:var(--border);color:var(--muted);border-radius:10px;padding:1px 7px;font-weight:600}
  .kanban-col-body{padding:8px;display:flex;flex-direction:column;gap:7px;flex:1}
  .kanban-card{background:var(--white);border:1px solid var(--border);border-radius:8px;padding:10px 11px;cursor:pointer;transition:box-shadow .15s,border-color .15s}
  .kanban-card:hover{box-shadow:0 3px 10px rgba(0,0,0,.1);border-color:var(--border2)}
  .kanban-card-name{font-size:13px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kanban-card-val{font-size:12px;font-family:var(--mono);color:#1a6e1a;font-weight:600}
  .kanban-card-meta{font-size:11px;color:var(--muted);margin-top:3px}
  .kanban-card-actions{display:flex;gap:5px;margin-top:8px;justify-content:flex-end}
  .kb-btn{font-size:11px;padding:3px 7px;border-radius:5px;border:1px solid var(--border2);background:var(--white);color:var(--muted);cursor:pointer;transition:all .1s;font-family:var(--sans)}
  .kb-btn:hover{border-color:var(--green);color:var(--green)}
  .kb-btn:disabled{opacity:.35;cursor:not-allowed}

  /* LEAD MODAL */
  .lead-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
  .lead-modal{background:var(--white);border-radius:14px;width:100%;max-width:620px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2)}
  .lead-modal-hdr{padding:18px 22px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
  .lead-modal-title{font-size:16px;font-weight:600}
  .lead-modal-body{overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:16px;flex:1}
  .lead-modal-ftr{padding:14px 22px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0}
  .modal-section{display:flex;flex-direction:column;gap:8px}
  .modal-section-title{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:2px}
  .comment-list{display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto}
  .comment-item{background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:9px 11px}
  .comment-date{font-size:10px;color:var(--muted);margin-bottom:3px}
  .comment-text{font-size:13px;line-height:1.5}
  .ver-mais{border:none;background:none;color:#1a5fa0;font-size:12px;font-weight:600;cursor:pointer;padding:2px 0 0;white-space:nowrap}
  .ver-mais:hover{text-decoration:underline}
  /* Markdown nos registros */
  .md{font-size:13px;line-height:1.55;color:var(--text);overflow-wrap:anywhere}
  .md-clamp{max-height:96px;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,#000 62%,transparent);mask-image:linear-gradient(180deg,#000 62%,transparent)}
  .md h1{font-size:16px;font-weight:600;margin:8px 0 4px;line-height:1.3}
  .md h2{font-size:14px;font-weight:600;margin:8px 0 3px;line-height:1.3}
  .md h3{font-size:13px;font-weight:600;margin:6px 0 2px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .md h1:first-child,.md h2:first-child,.md h3:first-child{margin-top:0}
  .md p{margin:4px 0}
  .md ul,.md ol{margin:4px 0 4px 18px}
  .md li{margin:2px 0}
  .md strong{font-weight:600}
  .md em{font-style:italic}
  .md a{color:#1a5fa0;text-decoration:underline}
  .md code{font-family:var(--mono);background:var(--surface);padding:1px 5px;border-radius:4px;font-size:12px}
  .md blockquote{border-left:3px solid var(--border2);padding-left:10px;margin:5px 0;color:var(--muted)}
  .md hr{border:none;border-top:1px solid var(--border);margin:8px 0}
  .contract-warning{background:#fff8f0;border:1px solid #f0c060;border-radius:8px;padding:10px 13px;font-size:12px;color:#8a5c00}
  .contract-warning ul{margin:6px 0 0 16px;line-height:1.8}
  .col-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:12px;background:var(--surface);color:var(--muted);border:1px solid var(--border)}
  .kanban-card.dragging{opacity:.4;cursor:grabbing}
  .kanban-card{cursor:grab}
  .kanban-col.drag-over{background:#eaf4ea;border-color:#2d6a2d;box-shadow:0 0 0 2px #2d6a2d44}
  .kanban-col.drag-over .kanban-col-body{background:#eaf4ea}
  .kanban-col.drag-blocked{background:#fdf0f0;border-color:var(--red);box-shadow:0 0 0 2px #b0303044}

  /* PAINEL DE CLIENTES */
  .pn-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
  .pn-fbtn{padding:6px 12px;font-size:12px;font-weight:500;border-radius:20px;border:1px solid var(--border2);background:var(--white);color:var(--muted);cursor:pointer;transition:all .12s}
  .pn-fbtn:hover{border-color:var(--green);color:var(--green)}
  .pn-fbtn.on{background:var(--green);border-color:var(--green);color:#fff}
  .pn-row{cursor:pointer}
  .pn-row:hover td{background:#f4f8f4}
  .pn-cli{padding:11px;text-align:left}
  .pn-cli-nome{font-weight:600;font-size:13px}
  .pn-cli-sub{font-size:11px;color:var(--muted);margin-top:1px}
  .pn-sem{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;padding:4px 9px;border-radius:20px;white-space:nowrap}
  .pn-td{padding:9px 10px;text-align:center;vertical-align:middle}
  .pn-td-l{padding:9px 10px;text-align:left;vertical-align:middle;font-size:12px}
  .pn-alerts{display:flex;flex-direction:column;gap:3px;align-items:flex-start}
  .pn-chip{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:6px;white-space:nowrap;line-height:1.5}
  .pn-chip.danger{background:var(--red-bg);color:var(--red)}
  .pn-chip.warn{background:var(--warn-bg);color:var(--warn)}
  .pn-chip.info{background:#eef4fb;color:#1a4a7a}
  .pn-temp{font-size:17px;line-height:1}
  .pn-empty{color:var(--muted);font-size:13px;padding:24px 0;text-align:center}

  /* CARD MODAL (centralizado, estilo ClickUp) */
  .dw-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px}
  .dw{background:var(--bg);width:100%;max-width:760px;max-height:90vh;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.28);animation:dwin .16s ease}
  @keyframes dwin{from{transform:scale(.97);opacity:0}to{transform:scale(1);opacity:1}}
  .dw-hdr{background:var(--white);padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0}
  .dw-title{font-size:17px;font-weight:600;letter-spacing:-.01em}
  .dw-sub{font-size:12px;color:var(--muted);margin-top:2px}
  .dw-x{border:none;background:transparent;font-size:22px;line-height:1;color:var(--muted);cursor:pointer;padding:0 4px}
  .dw-x:hover{color:var(--text)}
  .dw-body{overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px;flex:1}
  .dw-sec{background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;display:flex;flex-direction:column;gap:10px}
  .dw-sec-t{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
  .dw-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .dw-f{display:flex;flex-direction:column;gap:3px}
  .dw-f.full{grid-column:1/-1}
  .dw-lbl{font-size:11px;color:var(--muted);font-weight:500}
  .dw-in{border:1px solid var(--border2);border-radius:7px;padding:7px 9px;font-size:13px;background:var(--white);color:var(--text);width:100%;outline:none}
  .dw-in:focus{border-color:var(--green)}
  textarea.dw-in{resize:vertical;min-height:54px;font-family:var(--sans)}
  .dw-read{font-size:13px;font-weight:500}
  .dw-temp-row{display:flex;gap:6px;flex-wrap:wrap}
  .dw-temp-b{font-size:20px;padding:4px 7px;border-radius:8px;border:1.5px solid transparent;background:var(--surface);cursor:pointer;line-height:1;transition:all .12s}
  .dw-temp-b:hover{border-color:var(--border2)}
  .dw-temp-b.on{border-color:var(--green);background:var(--green-bg);transform:scale(1.08)}
  .dw-seg{display:flex;gap:4px;flex-wrap:wrap}
  .dw-seg-b{font-size:12px;font-weight:500;padding:6px 10px;border-radius:7px;border:1px solid var(--border2);background:var(--white);cursor:pointer;color:var(--muted);transition:all .12s}
  .dw-seg-b.on{color:#fff;border-color:transparent}
  .dw-link{display:flex;align-items:center;gap:8px;font-size:13px;color:#1a5fa0;text-decoration:none;padding:7px 10px;border:1px solid var(--border);border-radius:7px;background:var(--white);word-break:break-all}
  .dw-link:hover{background:#f4f8fb;border-color:#b0ccee}
  .dw-hist{display:flex;flex-direction:column;gap:7px;max-height:220px;overflow-y:auto}
  .dw-hist-item{display:flex;gap:9px;font-size:13px;align-items:baseline}
  .dw-hist-date{font-family:var(--mono);font-size:11px;color:var(--muted);flex-shrink:0;min-width:42px}
  .dw-hist-x{margin-left:auto;border:none;background:transparent;color:var(--muted2);cursor:pointer;font-size:14px}
  .dw-hist-x:hover{color:var(--red)}
  .dw-add{display:flex;gap:6px}
  .dw-chip-add{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
`;

// ── LOGIN PAGE ────────────────────────────────────────────────
function LoginPage() {
  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };
  return (
    <div className="login-wrap">
      <div className="login-box">
        <div style={{fontSize:36,marginBottom:12}}>💰</div>
        <div className="login-title">Fluxo de Caixa</div>
        <div className="login-sub">Controle financeiro pessoal e da empresa. Acesse com sua conta Google.</div>
        <button className="google-btn" onClick={handleGoogle}>
          <svg className="google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Entrar com Google
        </button>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [ano, setAno] = useState(2026);
  const [data26, setData26] = useState(null);
  const [data27, setData27] = useState(null);
  const [activeTab, setActiveTab] = useState("fluxo");
  const [saving, setSaving] = useState(false); // "idle"|"saving"|"saved"
  const [toast, setToast] = useState("");
  const [collapsedCats, setCollapsedCats] = useState({});
  const [atvCard, setAtvCard] = useState(null); // null | "cliente" | "servico" | "comissao"
  const [editingIdx, setEditingIdx] = useState(null);
  const [empCard, setEmpCard] = useState(null);  // null | number (índice da categoria)
  const [editingConta, setEditingConta] = useState(null); // null | {ci, cti}
  const [empMes, setEmpMes] = useState(0);
  const [atvMes, setAtvMes] = useState(0);
  const [dataKanban, setDataKanban] = useState(null);
  const [kanbanModalId, setKanbanModalId] = useState(null);
  const [kanbanEditForm, setKanbanEditForm] = useState(null);
  const [kanbanCommentText, setKanbanCommentText] = useState("");
  const [draggingLeadId, setDraggingLeadId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);
  const [painelDrawerId, setPainelDrawerId] = useState(null); // id da receita aberta no modal
  const [painelHistText, setPainelHistText] = useState("");
  const [menuOpen, setMenuOpen] = useState(true); // menu lateral aberto/recolhido
  const [ltvFiltro, setLtvFiltro] = useState("todos"); // todos | ativos | inativos
  const [prodCliId, setProdCliId] = useState(null); // id do cliente com modal de produtos aberto
  const [resumoMes, setResumoMes] = useState(0); // mês selecionado no resumo
  const [selRec, setSelRec] = useState({}); // receitas selecionadas p/ enviar ao contador (id->true)
  const [resumoCatRec, setResumoCatRec] = useState("all"); // filtro de grupo de receita no resumo
  const [resumoCatDesp, setResumoCatDesp] = useState("all"); // filtro de categoria de despesa no resumo

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingAuth(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load data when user logs in
  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    Promise.all([loadFromDB(uid, 2026), loadFromDB(uid, 2027), loadKanbanFromDB(uid)]).then(([d26, d27, dk]) => {
      setData26(d26);
      setData27(d27);
      setDataKanban(dk);
    });
  }, [session]);

  const D = ano === 2026 ? data26 : data27;
  const setD = ano === 2026 ? setData26 : setData27;

  // Auto-save with debounce
  const saveData = useCallback(async (newD, targetAno) => {
    if (!session) return;
    setSaving("saving");
    try {
      await saveToDB(session.user.id, targetAno, newD);
      setSaving("saved");
      setTimeout(() => setSaving("idle"), 2000);
    } catch (err) {
      setSaving("error");
      console.error("[fluxo-caixa] saveData falhou:", err?.message || err);
      setTimeout(() => setSaving("idle"), 4000);
    }
  }, [session]);

  function update(updater) {
    setD(prev => {
      const next = updater(JSON.parse(JSON.stringify(prev)));
      saveData(next, ano);
      return next;
    });
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  }

  const saveKanbanData = useCallback(async (kdata) => {
    if (!session) return;
    try {
      await saveToDB(session.user.id, 0, { leads: kdata.leads || [], crm: kdata.crm || {}, categoriasAnalise: kdata.categoriasAnalise || [], produtos: kdata.produtos || [] });
    } catch (err) {
      console.error("[fluxo-caixa] Erro ao salvar kanban:", err?.message || err);
    }
  }, [session]);

  function updateKanban(updater) {
    setDataKanban(prev => {
      const next = updater(JSON.parse(JSON.stringify(prev || { leads: [], crm: {}, categoriasAnalise: [], produtos: [] })));
      saveKanbanData(next);
      return next;
    });
  }

  // Dados de CRM por receita (id) — armazenados no balde ano=0, compartilhado entre anos
  function getCrm(id) {
    const base = { historico: [], alertasManuais: [], links: {} };
    return { ...base, ...((dataKanban && dataKanban.crm && dataKanban.crm[id]) || {}) };
  }
  function updateCrm(id, patch) {
    updateKanban(d => {
      if (!d.crm) d.crm = {};
      d.crm[id] = { ...{ historico: [], alertasManuais: [], links: {} }, ...(d.crm[id] || {}), ...patch };
      return d;
    });
  }

  // Texto de registro: renderiza Markdown e trunca os longos com "ver mais"
  function CommentText({ text, limit = 200 }) {
    const [open, setOpen] = useState(false);
    if (!text) return null;
    const long = text.length > limit;
    return (
      <div className="comment-text">
        <div className={`md${long && !open ? " md-clamp" : ""}`}>
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
        {long && <button className="ver-mais" onClick={()=>setOpen(o=>!o)}>{open ? "ver menos" : "ver mais +"}</button>}
      </div>
    );
  }

  // Valor da linha: clica para editar; escolhe aplicar só no mês ou deste mês em diante
  function ValorCell({ value, mes, tone = "rec", overridden = false, onApply }) {
    const [open, setOpen] = useState(false);
    const [v, setV] = useState(value);
    const badgeStyle = tone === "desp"
      ? { background:"#fdf0f0", color:"var(--red)", border:"1px solid #e0b0b0" }
      : undefined;
    if (!open) {
      return (
        <span className={`badge ${tone==="desp"?"":"b-g"}`} style={{ ...(badgeStyle||{}), cursor:"pointer" }}
          title={`Clique para alterar o valor${overridden?" (valor específico deste mês)":""}`}
          onClick={()=>{ setV(value); setOpen(true); }}>
          {fmt(value)}/mês{overridden?" *":""}
        </span>
      );
    }
    return (
      <span className="val-edit">
        <input className="val-in" type="number" value={v} autoFocus
          onChange={e=>setV(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Escape") setOpen(false); }} />
        <button className="btn btn-sm" title={`Aplicar só em ${mes}`} onClick={()=>{ onApply(parseFloat(v)||0,"mes"); setOpen(false); }}>Só {mes.substring(0,3)}</button>
        <button className="btn btn-p btn-sm" title={`Aplicar de ${mes} em diante`} onClick={()=>{ onApply(parseFloat(v)||0,"frente"); setOpen(false); }}>Em diante</button>
        <button className="btn-rm" title="Cancelar" onClick={()=>setOpen(false)}>×</button>
      </span>
    );
  }

  if (loadingAuth) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--muted)",fontFamily:"var(--sans)"}}>Carregando...</div>;
  if (!session) return <><style>{S}</style><LoginPage /></>;
  if (!D) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--muted)",fontFamily:"var(--sans)"}}>Carregando dados...</div>;

  const ms = ANOS_CONFIG[ano];
  const carry26 = data26 ? calcFlow(data26, 2026) : null;
  const carryover = ano === 2027 && carry26 ? carry26[carry26.length-1].caixa : null;
  const prevD = ano === 2027 ? data26 : null;
  const fl = calcFlow(D, ano, carryover, prevD);
  const last = fl[fl.length-1];
  const minR = fl.reduce((a,r) => r.caixa < a.caixa ? r : a);
  const cm = cliMes(D, ano);
  const ge = gastosEmpMes(D, ano, prevD);
  const user = session.user;

  // ── RENDER TABS (menu lateral) ─────────────────────────────
  const tabs = [
    {id:"fluxo",      label:"Fluxo",      icon:"📊"},
    {id:"empresa",    label:"Despesas",   icon:"💸"},
    {id:"ativos",     label:"Receitas",   icon:"💰"},
    {id:"ltv",        label:"LTV",        icon:"📈"},
    {id:"kanban",     label:"Kanban",     icon:"📋"},
    {id:"produtos",   label:"Produtos",   icon:"🛒"},
    {id:"categorias", label:"Categorias", icon:"🏷️"},
  ];

  // Categorias de análise já usadas nas contas (sugestões para o campo)
  const tagsDespesa = Array.from(new Set(
    [...(data26?.categorias||[]), ...(data27?.categorias||[])]
      .flatMap(cat=>(cat.contas||[]).map(ct=>(ct.tag||"").trim()))
      .filter(Boolean)
  )).sort();
  // Lista final para os selects: configuradas + já usadas
  const catsAnalise = Array.from(new Set([...(dataKanban?.categoriasAnalise||[]), ...tagsDespesa])).sort();

  // ── FLUXO TABLE ────────────────────────────────────────────
  function renderFluxo() {
    const totGP=fl.reduce((a,r)=>a+r.gp,0);
    const totGE=fl.reduce((a,r)=>a+r.ge,0);
    const totBa=fl.reduce((a,r)=>a+r.ba,0);
    const totCl=fl.reduce((a,r)=>a+r.cl,0);
    const totG=fl.reduce((a,r)=>a+r.gastos,0);
    const totE=fl.reduce((a,r)=>a+r.entradas,0);
    const totS=fl.reduce((a,r)=>a+r.saldo,0);
    return (
      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th style={{textAlign:"left"}}>Mês</th>
            <th>G. Pessoal</th><th>G. Empresa</th>
            <th>Banda</th><th>Receitas</th>
            <th style={{background:"#fdf5f5"}}>Total gasto</th>
            <th style={{background:"#f5fdf5"}}>Total renda</th>
            <th>Saldo mês</th><th>Caixa acum.</th>
          </tr></thead>
          <tbody>
            {fl.map((r,i)=>(
              <tr key={i} style={i===0?{background:"#fafaf5"}:{}}>
                <td className="td-m">{r.mes}</td>
                <td><input className="ed-inp" type="number" value={r.gp||""} style={{color:"var(--red)"}}
                  onChange={e=>update(d=>{d.gastosPessoal[i]=parseFloat(e.target.value)||0;return d;})}/></td>
                <td className="td-n neg">{r.ge>0?fmt(r.ge):"—"}</td>
                <td><input className="ed-inp" type="number" value={r.ba||""} style={{color:"#1a6e1a"}}
                  onChange={e=>update(d=>{d.banda[i]=parseFloat(e.target.value)||0;return d;})}/></td>
                <td className={`td-n ${r.cl>0?"pos":"dim"}`}>{r.cl>0?fmt(r.cl):"—"}</td>
                <td className="td-n neg" style={{fontWeight:600}}>{r.gastos>0?fmt(r.gastos):"—"}</td>
                <td className="td-n pos" style={{fontWeight:600}}>{r.entradas>0?fmt(r.entradas):"—"}</td>
                <td className={`td-s ${cc(r.saldo)}`}>{fmt(r.saldo)}</td>
                {ano===2026&&i===0
                  ? <td><input className="ed-inp" type="number" value={D.caixaInicial||""} style={{fontSize:14,fontWeight:600,color:r.caixa>=0?"#1a6e1a":"var(--red)"}}
                      onChange={e=>update(d=>{d.caixaInicial=parseFloat(e.target.value)||0;return d;})}/></td>
                  : <td className={`td-s ${cc(r.caixa)}`} style={{fontSize:14}}>{fmt(r.caixa)}</td>
                }
              </tr>
            ))}
            <tr style={{background:"var(--surface)",borderTop:"2px solid var(--border2)"}}>
              <td className="td-m" style={{fontSize:11,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em"}}>Total</td>
              <td className="td-n neg" style={{fontWeight:600}}>{fmt(totGP)}</td>
              <td className="td-n neg" style={{fontWeight:600}}>{fmt(totGE)}</td>
              <td className="td-n pos" style={{fontWeight:600}}>{fmt(totBa)}</td>
              <td className="td-n pos" style={{fontWeight:600}}>{totCl>0?fmt(totCl):"—"}</td>
              <td className="td-n neg" style={{fontWeight:700,fontSize:13}}>{fmt(totG)}</td>
              <td className="td-n pos" style={{fontWeight:700,fontSize:13}}>{fmt(totE)}</td>
              <td className={`td-s ${cc(totS)}`} style={{fontWeight:700}}>{fmt(totS)}</td>
              <td className="td-n dim" style={{fontSize:11}}>acum.</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // ── EMPRESA ────────────────────────────────────────────────
  function renderEmpresa() {
    const totalGeral = ge.reduce((a,v)=>a+v,0);

    function catTotal(cat) {
      return cat.contas.reduce((a,ct)=>{
        const ini=parseInt(ct.inicio),par=parseInt(ct.parcelas);
        return a+ms.reduce((acc,_,mi)=>mi>=ini&&(par===0||(mi-ini)<par)?acc+valEff(ct,mi):acc,0);
      },0);
    }

    // ── DETALHE DE UMA CATEGORIA ──
    if (empCard !== null) {
      const cat = D.categorias[empCard];
      if (!cat) { setEmpCard(null); return null; }
      return (
        <>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,flexWrap:"wrap"}}>
            <button className="btn btn-sm" onClick={()=>{setEmpCard(null);setEditingConta(null);}}>← Voltar</button>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:cat.cor}}/>
              <span style={{fontWeight:600,fontSize:17,color:cat.cor}}>{cat.nome}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
              <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={empMes===0} onClick={()=>setEmpMes(m=>m-1)}>‹</button>
              <select className="fi" style={{width:"auto",padding:"5px 10px",fontSize:13}} value={empMes} onChange={e=>setEmpMes(parseInt(e.target.value))}>
                {ms.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
              <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={empMes===ms.length-1} onClick={()=>setEmpMes(m=>m+1)}>›</button>
            </div>
            <button className="btn btn-p btn-sm" onClick={()=>setActiveTab("add-conta")}>+ Adicionar conta</button>
          </div>

          {cat.contas.length===0 && (
            <div style={{color:"var(--muted)",fontSize:13,padding:"12px 0"}}>Nenhuma conta nessa categoria ainda.</div>
          )}

          <div className="cli-list">
            {cat.contas.map((ct,cti)=>{
              const ini=parseInt(ct.inicio),par=parseInt(ct.parcelas),val=valEff(ct,empMes);
              // Mostrar apenas contas ativas no mês selecionado
              const ativaNoMes = empMes>=ini && (par===0||(empMes-ini)<par);
              if(!ativaNoMes) return null;
              const continuaProxAno = ano===2026 && par!==0 && ini+par>N_2026;
              const atual = par===0 ? null : (empMes-ini+1);
              const pago = !!(ct.pagos&&ct.pagos[empMes]);
              const ovr = !!(ct.valorMes && ct.valorMes[empMes]!=null);
              return (
                <div className="cli-row" key={cti}>
                  <div className="cli-row-main">
                    <span className="cli-row-nome">{ct.nome}</span>
                    {ct.tag && <span className="badge b-gray" style={{flexShrink:0}}>{ct.tag}</span>}
                    <span className="cli-row-sub">
                      {par===0?"Fixa":`${atual}/${par}`}{ct.vencimento?` · vence dia ${ct.vencimento}`:""}
                    </span>
                  </div>
                  <div className="cli-row-actions">
                    <ValorCell value={val} mes={ms[empMes]} tone="desp" overridden={ovr}
                      onApply={(nv,scope)=>update(d=>{applyValor(d.categorias[empCard].contas[cti],scope,empMes,nv,ms.length);return d;})}/>
                    {continuaProxAno&&<span className="badge" style={{background:"#eef4fb",color:"#1a5fa0",border:"1px solid #b0ccee"}}>continua em 2027</span>}
                    <button className={`pill-tog ${pago?"on":"off"}`} title={`Marcar como ${pago?"não pago":"pago"} em ${ms[empMes]}`}
                      onClick={()=>update(d=>{const x=d.categorias[empCard].contas[cti];if(!x.pagos)x.pagos={};x.pagos[empMes]=!x.pagos[empMes];return d;})}>
                      {pago?"✓ Pago":"Não pago"}
                    </button>
                    <button className="btn btn-sm" onClick={()=>setEditingConta({ci:empCard,cti})}>Editar</button>
                    <button className="btn-rm" onClick={()=>{if(confirm("Remover?"))update(d=>{d.categorias[empCard].contas.splice(cti,1);return d;});}}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* MODAL DE EDIÇÃO (80% da tela) */}
          {editingConta!==null && D.categorias[editingConta.ci]?.contas[editingConta.cti] && (
            <div className="edit-modal-ov" onClick={e=>{if(e.target===e.currentTarget)setEditingConta(null);}}>
              <div className="edit-modal">
                <div className="edit-modal-hdr">
                  <div className="edit-modal-title">Editar despesa</div>
                  <button className="dw-x" onClick={()=>setEditingConta(null)} title="Fechar">×</button>
                </div>
                <EditContaForm ci={editingConta.ci} cti={editingConta.cti}
                  conta={D.categorias[editingConta.ci].contas[editingConta.cti]}
                  onDone={()=>setEditingConta(null)}/>
              </div>
            </div>
          )}
        </>
      );
    }

    // ── CARDS DE CATEGORIAS ──
    return (
      <>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div>
            <div className="pg-title">Despesas da empresa</div>
            <div style={{fontSize:13,color:"var(--muted)"}}>Os totais alimentam automaticamente o fluxo.</div>
          </div>
          <button className="btn btn-p btn-sm" onClick={()=>setActiveTab("add-conta")}>+ Adicionar conta</button>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          {totalGeral>0&&<span style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--muted)"}}>Total {ano}: <strong style={{color:"var(--red)"}}>{fmt(totalGeral)}</strong></span>}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:12,color:"var(--muted)"}}>Mês:</span>
            <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={empMes===0} onClick={()=>setEmpMes(m=>m-1)}>‹</button>
            <select className="fi" style={{width:"auto",padding:"5px 10px",fontSize:13}} value={empMes} onChange={e=>setEmpMes(parseInt(e.target.value))}>
              {ms.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={empMes===ms.length-1} onClick={()=>setEmpMes(m=>m+1)}>›</button>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:16}}>
          {D.categorias.map((cat,ci)=>{
            const total=catTotal(cat);
            const totalMes=cat.contas.reduce((a,ct)=>{
              const ini=parseInt(ct.inicio),par=parseInt(ct.parcelas);
              const ativo=empMes>=ini&&(par===0||(empMes-ini)<par);
              return a+(ativo?valEff(ct,empMes):0);
            },0);
            return (
              <div key={ci} onClick={()=>{setEmpCard(ci);setEditingConta(null);}} style={{
                background:"#fff",border:`1.5px solid ${cat.cor}33`,borderRadius:"var(--r)",
                padding:18,cursor:"pointer",transition:"box-shadow .15s",position:"relative",
              }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.1)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}
              >
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:cat.cor,flexShrink:0}}/>
                  <span style={{fontWeight:600,fontSize:13,color:cat.cor}}>{cat.nome}</span>
                </div>
                <div style={{fontSize:20,fontWeight:700,fontFamily:"var(--mono)",color:"var(--red)"}}>
                  {fmt(totalMes)}<span style={{fontSize:10,fontWeight:400,color:"var(--muted)"}}>/mês</span>
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                  {(()=>{const n=cat.contas.filter(ct=>parseInt(ct.parcelas)===0||parseInt(ct.inicio)+parseInt(ct.parcelas)>empMes).length;return `${n} conta${n!==1?"s":""}`;})()}
                  {cat.contas.length>0?` · ${fmt(total)}/ano`:""}
                </div>
                <div style={{marginTop:10,fontSize:12,color:cat.cor,fontWeight:500}}>Ver detalhes →</div>
                <button className="btn-rm" style={{position:"absolute",top:10,right:10,fontSize:14}} onClick={e=>{e.stopPropagation();if(confirm(`Remover "${cat.nome}" e todas as contas?`))update(d=>{d.categorias.splice(ci,1);return d;});}}
                >×</button>
              </div>
            );
          })}
        </div>

        <button className="btn btn-sm" onClick={()=>{
          const nome=prompt("Nome do novo grupo:");
          if(!nome)return;
          const cores=["#c0392b","#d67e20","#8e44ad","#1a5fa0","#1a7a4a","#806020","#305090"];
          update(d=>{d.categorias.push({id:"cat_"+Date.now(),nome:nome.trim(),cor:cores[d.categorias.length%cores.length],contas:[]});return d;});
        }}>+ Novo grupo</button>

        {/* GASTOS POR CATEGORIA (análise) */}
        {(()=>{
          const porTag = {};
          D.categorias.forEach(cat=>cat.contas.forEach(ct=>{
            const tag = (ct.tag||"").trim() || "Sem categoria";
            if(!porTag[tag]) porTag[tag] = { mes:0, ano:0, n:0 };
            const ini=parseInt(ct.inicio), par=parseInt(ct.parcelas);
            porTag[tag].n++;
            if(empMes>=ini&&(par===0||(empMes-ini)<par)) porTag[tag].mes += valEff(ct,empMes);
            ms.forEach((_,mi)=>{ if(mi>=ini&&(par===0||(mi-ini)<par)) porTag[tag].ano += valEff(ct,mi); });
          }));
          const linhas = Object.entries(porTag).sort((a,b)=>b[1].ano-a[1].ano);
          const totAno = linhas.reduce((a,[,v])=>a+v.ano,0);
          const totMes = linhas.reduce((a,[,v])=>a+v.mes,0);
          if(linhas.length===0) return null;
          const semCategoria = porTag["Sem categoria"]?.n || 0;
          return (
            <>
              <div className="sec-label">Gastos por categoria</div>
              {semCategoria>0 && (
                <div className="alert warn"><span className="a-dot"/>{semCategoria} conta{semCategoria!==1?"s":""} ainda sem categoria de análise — edite a conta para classificar.</div>
              )}
              <div className="tbl-wrap" style={{maxWidth:640}}>
                <table>
                  <thead><tr>
                    <th style={{textAlign:"left"}}>Categoria</th>
                    <th>Contas</th>
                    <th>{ms[empMes]}</th>
                    <th>Total {ano}</th>
                    <th>% do ano</th>
                  </tr></thead>
                  <tbody>
                    {linhas.map(([tag,v])=>(
                      <tr key={tag}>
                        <td className="td-m" style={tag==="Sem categoria"?{color:"var(--muted)",fontStyle:"italic"}:{}}>{tag}</td>
                        <td className="td-n">{v.n}</td>
                        <td className="td-n neg">{v.mes>0?fmt(v.mes):"—"}</td>
                        <td className="td-n neg" style={{fontWeight:600}}>{fmt(v.ano)}</td>
                        <td className="td-n">{totAno>0?Math.round(v.ano/totAno*100)+"%":"—"}</td>
                      </tr>
                    ))}
                    <tr style={{background:"var(--surface)",borderTop:"2px solid var(--border2)"}}>
                      <td className="td-m" style={{fontSize:11,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em"}}>Total</td>
                      <td className="td-n" style={{fontWeight:600}}>{linhas.reduce((a,[,v])=>a+v.n,0)}</td>
                      <td className="td-n neg" style={{fontWeight:700}}>{fmt(totMes)}</td>
                      <td className="td-n neg" style={{fontWeight:700}}>{fmt(totAno)}</td>
                      <td className="td-n" style={{fontWeight:600}}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </>
    );
  }

  // ── RECEITAS (antigo Clientes ativos) ─────────────────────
  const GRUPOS = [
    {key:"cliente",  label:"Clientes",  cor:"#2d6a2d", bg:"#eaf4ea", brd:"#b0d4b0"},
    {key:"servico",  label:"Serviços",  cor:"#1a5fa0", bg:"#eef4fb", brd:"#b0ccee"},
    {key:"comissao", label:"Comissões", cor:"#8e44ad", bg:"#f5eefb", brd:"#d4b0e8"},
  ];
  const SBADGE = {ativo:"b-g",proposta:"b-w",prospecto:"b-gray"};
  const SLBL   = {ativo:"Ativo",proposta:"Proposta enviada",prospecto:"Prospecto"};
  const TIPOS  = {assessor:"Assessor — consórcio",trafego:"Tráfego pago",ecossistema:"Ecossistema completo",consorcio:"Consórcio próprio",outro:"Outro"};

  function renderAtivos() {
    // ── DETALHE DE UM GRUPO ──
    if (atvCard) {
      const grupo = GRUPOS.find(g=>g.key===atvCard);
      const items = D.clientes.map((c,i)=>({...c,_i:i})).filter(c=>(c.tipoReceita||"cliente")===atvCard);
      const ativosNoMes = items.filter(c=>cliAtivoMes(c,atvMes));
      const nSel = ativosNoMes.filter(c=>selRec[c.id]).length;
      const allSel = ativosNoMes.length>0 && ativosNoMes.every(c=>selRec[c.id]);
      const toggleAll = ()=>setSelRec(p=>{const n={...p};if(allSel)ativosNoMes.forEach(c=>delete n[c.id]);else ativosNoMes.forEach(c=>{n[c.id]=true;});return n;});
      const copiarContador = ()=>{
        const sel = ativosNoMes.filter(c=>selRec[c.id]);
        if(sel.length===0){showToast("Selecione ao menos uma receita.");return;}
        const fmtBR = v=>(parseFloat(v)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
        let txt = `Olá! Seguem as receitas de ${ms[atvMes]}/${ano} para emissão de NF:\n\n`;
        sel.forEach((c,idx)=>{txt+=`${idx+1}. ${c.nome} — ${fmtBR(cliValMes(c,atvMes))}\n`;});
        txt += `\nTotal: ${fmtBR(sel.reduce((a,c)=>a+cliValMes(c,atvMes),0))}`;
        if(navigator.clipboard?.writeText){
          navigator.clipboard.writeText(txt).then(()=>showToast(`Mensagem copiada (${sel.length} receita(s))!`)).catch(()=>window.prompt("Copie a mensagem:",txt));
        } else window.prompt("Copie a mensagem:",txt);
      };
      return (
        <>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,flexWrap:"wrap"}}>
            <button className="btn btn-sm" onClick={()=>{setAtvCard(null);setEditingIdx(null);}}>← Voltar</button>
            <div style={{fontWeight:600,fontSize:17,color:grupo.cor}}>{grupo.label}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
              <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={atvMes===0} onClick={()=>setAtvMes(m=>m-1)}>‹</button>
              <select className="fi" style={{width:"auto",padding:"5px 10px",fontSize:13}} value={atvMes} onChange={e=>setAtvMes(parseInt(e.target.value))}>
                {ms.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
              <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={atvMes===ms.length-1} onClick={()=>setAtvMes(m=>m+1)}>›</button>
            </div>
            <button className="btn btn-p btn-sm" onClick={()=>setActiveTab("clientes")}>+ Receita</button>
          </div>

          {ativosNoMes.length===0 ? (
            <div style={{color:"var(--muted)",fontSize:13,padding:"12px 0"}}>
              Nenhuma receita ativa em {ms[atvMes]}.
            </div>
          ) : (
            <div className="rec-bar">
              <label className="rec-bar-chk">
                <input type="checkbox" className="rec-chk" checked={allSel} onChange={toggleAll}/>
                Selecionar todas
              </label>
              <span style={{fontSize:12,color:"var(--muted)"}}>{nSel} selecionada(s)</span>
              <button className="btn btn-p btn-sm" style={{marginLeft:"auto"}} disabled={nSel===0} onClick={copiarContador}>
                📋 Copiar mensagem pro contador
              </button>
            </div>
          )}

          <div className="cli-list compact">
            {items.map(c=>{
              const i=c._i, ini=parseInt(c.inicio), par=parseInt(c.parcelas), val=cliValMes(c,atvMes);
              const temProdutos = Array.isArray(c.produtosContratados) && c.produtosContratados.length>0;

              // Só mostra se ativa no mês selecionado
              if(!cliAtivoMes(c,atvMes)) return null;

              const atual = par===0 ? null : (atvMes-ini+1);
              const rec = !!(c.recebidos&&c.recebidos[atvMes]);
              const ovr = !!(c.valorMes && c.valorMes[atvMes]!=null);
              return (
                <div className="cli-row" key={i}>
                  <input type="checkbox" className="rec-chk" checked={!!selRec[c.id]} onChange={()=>setSelRec(p=>({...p,[c.id]:!p[c.id]}))}/>
                  <div className="cli-row-main">
                    <span className="cli-row-nome">{c.nome}</span>
                    <span className="cli-row-sub">{TIPOS[c.tipo]||c.tipo||"—"} · {temProdutos?`${c.produtosContratados.length} produto${c.produtosContratados.length!==1?"s":""}`:(par===0?"Fixa":`${atual}/${par}`)}</span>
                  </div>
                  <div className="cli-row-actions">
                    {c.status!=="ativo" && <span className={`badge ${SBADGE[c.status]||"b-gray"}`}>{SLBL[c.status]||c.status}</span>}
                    {temProdutos ? (
                      <span className="badge b-g" style={{cursor:"pointer"}} title="Valor definido pelos produtos — clique para gerenciar"
                        onClick={()=>setProdCliId(c.id)}>
                        {fmt(val)}/mês 🛒
                      </span>
                    ) : (
                      <ValorCell value={val} mes={ms[atvMes]} tone="rec" overridden={ovr}
                        onApply={(nv,scope)=>update(d=>{applyValor(d.clientes[i],scope,atvMes,nv,ms.length);return d;})}/>
                    )}
                    {c.status==="ativo" && (
                      <button className={`pill-tog ${rec?"on":"off"}`} title={`Marcar como ${rec?"não recebido":"recebido"} em ${ms[atvMes]}`}
                        onClick={()=>update(d=>{const x=d.clientes[i];if(!x.recebidos)x.recebidos={};x.recebidos[atvMes]=!x.recebidos[atvMes];return d;})}>
                        {rec?"✓ Recebido":"Não recebido"}
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={()=>setEditingIdx(i)}>Editar</button>
                    <button className="btn-rm" onClick={()=>{if(confirm("Remover?"))update(d=>{d.clientes.splice(i,1);return d;});}}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* MODAL DE EDIÇÃO (80% da tela) */}
          {editingIdx!==null && D.clientes[editingIdx] && (
            <div className="edit-modal-ov" onClick={e=>{if(e.target===e.currentTarget)setEditingIdx(null);}}>
              <div className="edit-modal">
                <div className="edit-modal-hdr">
                  <div className="edit-modal-title">Editar receita</div>
                  <button className="dw-x" onClick={()=>setEditingIdx(null)} title="Fechar">×</button>
                </div>
                <EditItemForm idx={editingIdx} item={D.clientes[editingIdx]} onDone={()=>setEditingIdx(null)}/>
              </div>
            </div>
          )}

          {items.some(c=>c.status==="ativo")&&(
            <>
              <hr className="dv"/>
              <div className="sec-label">Receita por mês</div>
              <div className="tbl-wrap" style={{maxWidth:280}}>
                <table><thead><tr><th style={{textAlign:"left"}}>Mês</th><th>Total</th></tr></thead>
                  <tbody>{ms.map((m,mi)=>{
                    const v=items.filter(c=>c.status==="ativo").reduce((a,c)=>a+cliValMes(c,mi),0);
                    return v>0?<tr key={mi}><td className="td-m">{m}</td><td className="td-n pos" style={{fontWeight:600}}>{fmt(v)}</td></tr>:null;
                  })}</tbody>
                </table>
              </div>
            </>
          )}
        </>
      );
    }

    // ── CARDS DE GRUPOS ──
    const totalGeral = D.clientes.filter(c=>c.status==="ativo").reduce((a,c)=>a+(parseFloat(c.valor)||0),0);
    return (
      <>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:10}}>
          <div><div className="pg-title" style={{marginBottom:2}}>Receitas</div>
            <div className="pg-sub" style={{marginBottom:0}}>Clique em um grupo para ver e editar os itens.</div></div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:12,color:"var(--muted)"}}>Mês:</span>
            <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={atvMes===0} onClick={()=>setAtvMes(m=>m-1)}>‹</button>
            <select className="fi" style={{width:"auto",padding:"5px 10px",fontSize:13}} value={atvMes} onChange={e=>setAtvMes(parseInt(e.target.value))}>
              {ms.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={atvMes===ms.length-1} onClick={()=>setAtvMes(m=>m+1)}>›</button>
            <button className="btn btn-p btn-sm" onClick={()=>setActiveTab("clientes")}>+ Adicionar receita</button>
          </div>
        </div>
        {totalGeral>0&&<div style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--muted)",marginBottom:16}}>Total ativo em {ms[atvMes]}: <strong style={{color:"#1a6e1a"}}>{fmt(D.clientes.filter(c=>c.status==="ativo").reduce((a,c)=>a+cliValMes(c,atvMes),0))}/mês</strong></div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}>
          {GRUPOS.map(g=>{
            const items=D.clientes.map((c,i)=>({...c,_i:i})).filter(c=>(c.tipoReceita||"cliente")===g.key);
            const ativosNoMes=items.filter(c=>c.status==="ativo"&&cliAtivoMes(c,atvMes));
            const totalMes=ativosNoMes.reduce((a,c)=>a+cliValMes(c,atvMes),0);
            return (
              <div key={g.key} onClick={()=>setAtvCard(g.key)} style={{
                background:g.bg, border:`1.5px solid ${g.brd}`, borderRadius:"var(--r)",
                padding:"11px 13px", cursor:"pointer", transition:"box-shadow .15s",
              }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.1)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}
              >
                <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8}}>
                  <span style={{fontWeight:600,fontSize:12,color:g.cor}}>{g.label}</span>
                  <span style={{fontSize:11,color:g.cor,fontWeight:500}}>→</span>
                </div>
                <div style={{fontSize:17,fontWeight:700,fontFamily:"var(--mono)",color:g.cor,marginTop:3}}>
                  {fmt(totalMes)}<span style={{fontSize:10,fontWeight:400,color:"var(--muted)"}}>/mês</span>
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>
                  {ativosNoMes.length} ativo{ativosNoMes.length!==1?"s":""} em {ms[atvMes]}
                </div>
              </div>
            );
          })}
        </div>

        {/* DASH ANUAL — mini cards por mês */}
        <div style={{marginTop:24}}>
          <div className="sec-label" style={{marginTop:0}}>Panorama anual</div>
          <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>
            {ms.map((m,mi)=>{
              const ativosNoMes=D.clientes.filter(c=>c.status==="ativo"&&cliAtivoMes(c,mi));
              const totalMes=ativosNoMes.reduce((a,c)=>a+cliValMes(c,mi),0);
              const selecionado=mi===atvMes;
              return (
                <div key={mi} onClick={()=>{setAtvMes(mi);setAtvCard("cliente");}} style={{
                  minWidth:150,flexShrink:0,background:selecionado?"#eaf4ea":"#fff",
                  border:`1.5px solid ${selecionado?"#2d6a2d":"#e2e1db"}`,
                  borderRadius:"var(--r)",padding:"12px 14px",cursor:"pointer",
                  transition:"box-shadow .15s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.08)"}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}
                >
                  <div style={{fontWeight:600,fontSize:12,color:selecionado?"#2d6a2d":"var(--muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>{m}</div>
                  <div style={{fontFamily:"var(--mono)",fontSize:16,fontWeight:700,color:totalMes>0?"#1a6e1a":"var(--muted2)",marginBottom:8}}>
                    {totalMes>0?fmt(totalMes):"—"}
                  </div>
                  {ativosNoMes.length===0
                    ? <div style={{fontSize:11,color:"var(--muted2)",fontStyle:"italic"}}>Nenhum</div>
                    : ativosNoMes.map((c,ci)=>{
                        const g=GRUPOS.find(g=>g.key===(c.tipoReceita||"cliente"));
                        return (
                          <div key={ci} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                            <div style={{width:6,height:6,borderRadius:"50%",background:g?.cor||"#888",flexShrink:0}}/>
                            <span style={{fontSize:11,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nome}</span>
                            <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--mono)",marginLeft:"auto",flexShrink:0}}>{fmt(cliValMes(c,mi))}</span>
                          </div>
                        );
                      })
                  }
                </div>
              );
            })}
          </div>
        </div>

        {/* GRÁFICO XY — receita por mês */}
        <div className="card" style={{marginTop:24}}>
          <div className="sec-label" style={{marginTop:0,marginBottom:14}}>Receita por mês — {ano}</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={ms.map((m,mi)=>({ mes: m.substring(0,3), receita: cm[mi]||0 }))} margin={{top:5,right:14,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e1db"/>
              <XAxis dataKey="mes" tick={{fontSize:11,fill:"#888780"}} tickLine={false} axisLine={{stroke:"#d0cfc8"}}/>
              <YAxis tick={{fontSize:11,fill:"#888780"}} tickLine={false} axisLine={false}
                tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
              <Tooltip formatter={v=>[fmt(v),"Receita"]} labelStyle={{color:"#1a1a18",fontWeight:600}}
                contentStyle={{borderRadius:8,border:"1px solid #e2e1db",fontSize:12}}/>
              <Line type="monotone" dataKey="receita" stroke="#2d6a2d" strokeWidth={2.5}
                dot={{r:3,fill:"#2d6a2d"}} activeDot={{r:5}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  }

  // ── RESUMO DO MÊS (previsto x realizado) ───────────────────
  function renderResumoMes() {
    const mi = resumoMes;
    const ativo = (ini, par) => mi >= ini && (par === 0 || (mi - ini) < par);

    // Receitas itemizadas (clientes ativos no mês)
    const recItens = [];
    (D.clientes || []).forEach((c, i) => {
      if (c.status === "ativo" && cliAtivoMes(c, mi)) {
        recItens.push({ i, id: c.id, temProdutos: Array.isArray(c.produtosContratados) && c.produtosContratados.length>0, nome: c.nome, val: cliValMes(c, mi), ovr: !!(c.valorMes && c.valorMes[mi]!=null), grupo: c.tipoReceita || "cliente", recebido: !!(c.recebidos && c.recebidos[mi]) });
      }
    });
    // Despesas itemizadas (contas ativas no mês)
    const despItens = [];
    (D.categorias || []).forEach((cat, ci) => {
      cat.contas.forEach((ct, cti) => {
        const ini = parseInt(ct.inicio), par = parseInt(ct.parcelas), val = parseFloat(ct.valor) || 0;
        if (ativo(ini, par)) {
          despItens.push({ ci, cti, nome: ct.nome, cat: cat.nome, cor: cat.cor, val: valEff(ct, mi), ovr: !!(ct.valorMes && ct.valorMes[mi]!=null), pago: !!(ct.pagos && ct.pagos[mi]) });
        }
      });
    });

    const recPrev = recItens.reduce((a, r) => a + r.val, 0);
    const recReal = recItens.filter(r => r.recebido).reduce((a, r) => a + r.val, 0);
    const despPrev = despItens.reduce((a, d) => a + d.val, 0);
    const despReal = despItens.filter(d => d.pago).reduce((a, d) => a + d.val, 0);
    const saldoPrev = recPrev - despPrev;
    const saldoReal = recReal - despReal;
    const aReceber = recPrev - recReal;
    const aPagar = despPrev - despReal;

    // Saldo realizado acumulado dos meses anteriores (recebido - pago em cada mês anterior)
    const realizadoMes = (k) => {
      let r = 0, dd = 0;
      (D.clientes || []).forEach(c => {
        if (c.status === "ativo" && cliAtivoMes(c, k) && c.recebidos && c.recebidos[k]) r += cliValMes(c, k);
      });
      (D.categorias || []).forEach(cat => cat.contas.forEach(ct => {
        const ini = parseInt(ct.inicio), par = parseInt(ct.parcelas);
        if (k >= ini && (par === 0 || (k - ini) < par) && ct.pagos && ct.pagos[k]) dd += valEff(ct, k);
      }));
      return r - dd;
    };
    let saldoAnterior = 0;
    for (let k = 0; k < mi; k++) saldoAnterior += realizadoMes(k);
    const saldoRealAcum = saldoAnterior + saldoReal;

    // Filtros por categoria (afetam apenas as listas abaixo, não os cards do mês)
    const recView = resumoCatRec === "all" ? recItens : recItens.filter(r => r.grupo === resumoCatRec);
    const despView = resumoCatDesp === "all" ? despItens : despItens.filter(d => String(d.ci) === String(resumoCatDesp));
    const recViewTot = recView.reduce((a, r) => a + r.val, 0);
    const despViewTot = despView.reduce((a, d) => a + d.val, 0);
    const selStyle = { width:"auto", padding:"4px 8px", fontSize:12, marginLeft:"auto" };

    return (
      <>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:16}}>
          <div>
            <div className="pg-title" style={{marginBottom:2}}>Resumo do mês</div>
            <div className="pg-sub" style={{marginBottom:0}}>Previsto × realizado de <strong>{ms[mi]} {ano}</strong>, com base no que está marcado como pago/recebido. Não altera a aba Fluxo.</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:12,color:"var(--muted)"}}>Mês:</span>
            <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={mi===0} onClick={()=>setResumoMes(m=>m-1)}>‹</button>
            <select className="fi" style={{width:"auto",padding:"5px 10px",fontSize:13}} value={mi} onChange={e=>setResumoMes(parseInt(e.target.value))}>
              {ms.map((m,idx)=><option key={idx} value={idx}>{m}</option>)}
            </select>
            <button className="btn btn-sm" style={{padding:"5px 10px"}} disabled={mi===ms.length-1} onClick={()=>setResumoMes(m=>m+1)}>›</button>
          </div>
        </div>

        <div className="cards-row" style={{gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))"}}>
          <div className="card">
            <div className="stat-lbl">Saldo mês anterior</div>
            <div className={`stat-val ${cc(saldoAnterior)}`}>{fmt(saldoAnterior)}</div>
            <div className="stat-sub">{mi>0?`acumulado até ${ms[mi-1]}`:"sem mês anterior"}</div>
          </div>
          <div className="card">
            <div className="stat-lbl">Receitas recebidas</div>
            <div className="stat-val pos">{fmt(recReal)}</div>
            <div className="stat-sub">de {fmt(recPrev)} previsto{aReceber>0?` · a receber ${fmt(aReceber)}`:""}</div>
          </div>
          <div className="card">
            <div className="stat-lbl">Despesas pagas</div>
            <div className="stat-val neg">{fmt(despReal)}</div>
            <div className="stat-sub">de {fmt(despPrev)} previsto{aPagar>0?` · a pagar ${fmt(aPagar)}`:""}</div>
          </div>
          <div className="card">
            <div className="stat-lbl">Saldo realizado (acum.)</div>
            <div className={`stat-val ${cc(saldoRealAcum)}`}>{fmt(saldoRealAcum)}</div>
            <div className="stat-sub">este mês: {fmt(saldoReal)} + anterior {fmt(saldoAnterior)}</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginTop:4}}>
          {/* A RECEBER */}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span className="sec-label" style={{margin:0}}>Receitas · {recView.filter(r=>r.recebido).length}/{recView.length} recebidas · {fmt(recViewTot)}</span>
              <select className="fi" style={selStyle} value={resumoCatRec} onChange={e=>setResumoCatRec(e.target.value)}>
                <option value="all">Todos os grupos</option>
                {GRUPOS.map(g=><option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
            {recItens.length===0 ? <div className="pn-empty" style={{padding:"14px 0"}}>Nenhuma receita ativa em {ms[mi]}.</div>
             : recView.length===0 ? <div className="pn-empty" style={{padding:"14px 0"}}>Nenhuma receita nesse grupo.</div> : (
              <div className="cli-list compact">
                {recView.map(r=>(
                  <div className="cli-row" key={"r"+r.i}>
                    <div className="cli-row-main">
                      <span className="cli-row-nome">{r.nome}</span>
                    </div>
                    {r.temProdutos ? (
                      <span className="badge b-g" style={{cursor:"pointer"}} title="Valor definido pelos produtos — clique para gerenciar"
                        onClick={()=>setProdCliId(r.id)}>{fmt(r.val)}/mês 🛒</span>
                    ) : (
                      <ValorCell value={r.val} mes={ms[mi]} tone="rec" overridden={r.ovr}
                        onApply={(nv,scope)=>update(d=>{applyValor(d.clientes[r.i],scope,mi,nv,ms.length);return d;})}/>
                    )}
                    <button className={`pill-tog ${r.recebido?"on":"off"}`}
                      onClick={()=>update(d=>{const x=d.clientes[r.i];if(!x.recebidos)x.recebidos={};x.recebidos[mi]=!x.recebidos[mi];return d;})}>
                      {r.recebido?"✓ Recebido":"Não recebido"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* A PAGAR */}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span className="sec-label" style={{margin:0}}>Despesas · {despView.filter(d=>d.pago).length}/{despView.length} pagas · {fmt(despViewTot)}</span>
              <select className="fi" style={selStyle} value={resumoCatDesp} onChange={e=>setResumoCatDesp(e.target.value)}>
                <option value="all">Todas as categorias</option>
                {(D.categorias||[]).map((cat,ci)=><option key={ci} value={ci}>{cat.nome}</option>)}
              </select>
            </div>
            {despItens.length===0 ? <div className="pn-empty" style={{padding:"14px 0"}}>Nenhuma despesa ativa em {ms[mi]}.</div>
             : despView.length===0 ? <div className="pn-empty" style={{padding:"14px 0"}}>Nenhuma despesa nessa categoria.</div> : (
              <div className="cli-list compact">
                {despView.map(d=>(
                  <div className="cli-row" key={"d"+d.ci+"-"+d.cti}>
                    <div className="cli-row-main">
                      <span className="cli-row-nome">{d.nome}</span>
                      <span className="cli-row-sub" style={{color:d.cor}}>{d.cat}</span>
                    </div>
                    <ValorCell value={d.val} mes={ms[mi]} tone="desp" overridden={d.ovr}
                      onApply={(nv,scope)=>update(dd=>{applyValor(dd.categorias[d.ci].contas[d.cti],scope,mi,nv,ms.length);return dd;})}/>
                    <button className={`pill-tog ${d.pago?"on":"off"}`}
                      onClick={()=>update(dd=>{const x=dd.categorias[d.ci].contas[d.cti];if(!x.pagos)x.pagos={};x.pagos[mi]=!x.pagos[mi];return dd;})}>
                      {d.pago?"✓ Pago":"Não pago"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── PAINEL DE CLIENTES ─────────────────────────────────────
  function fmtData(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return "—";
    return String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
  }

  function renderPainelDrawer() {
    if (!painelDrawerId) return null;
    // Procura a receita nos dois anos (o LTV lista clientes de 2026 e 2027)
    const c = [...(data26?.clientes||[]), ...(data27?.clientes||[])].find(x => x.id === painelDrawerId);
    if (!c) return null; // receita não existe
    const crm = getCrm(c.id);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const alerts = computeAutoAlerts(crm, hoje);
    const set = (patch) => updateCrm(c.id, patch);
    const links = crm.links || {};
    const setLink = (k,v) => set({ links: { ...links, [k]: v } });
    const grupo = GRUPOS.find(g => g.key === (c.tipoReceita || "cliente"));

    let tempo = null;
    if (crm.dataEntrada) {
      const de = new Date(crm.dataEntrada + "T00:00:00");
      if (!isNaN(de)) {
        const m = Math.max(0, Math.floor((hoje - de) / 2629800000));
        tempo = m < 1 ? "menos de 1 mês" : m < 12 ? `${m} ${m===1?"mês":"meses"}` : `${Math.floor(m/12)}a ${m%12}m`;
      }
    }
    const close = () => { setPainelDrawerId(null); setPainelHistText(""); };

    const F = (lbl, key, type="text", ph="") => (
      <div className="dw-f">
        <label className="dw-lbl">{lbl}</label>
        <input className="dw-in" type={type} placeholder={ph} value={crm[key] || ""} onChange={e=>set({[key]: e.target.value})}/>
      </div>
    );
    const FL = (lbl, key, ph="") => (
      <div className="dw-f full">
        <label className="dw-lbl">{lbl}</label>
        <input className="dw-in" placeholder={ph} value={links[key] || ""} onChange={e=>setLink(key, e.target.value)}/>
      </div>
    );

    const ferramentas = (links.ferramentas || "").split("\n").map(s=>s.trim()).filter(Boolean);
    const quickLinks = [
      { k:"drive",    lbl:"📁 Pasta do Drive", url:links.drive },
      { k:"contrato", lbl:"📄 Contrato",        url:links.contrato },
      { k:"dashboard",lbl:"📊 Dashboard",       url:links.dashboard },
      { k:"grupo",    lbl:"💬 Grupo WhatsApp",  url:links.grupo },
    ].filter(l => l.url);

    return (
      <div className="dw-ov" onClick={e=>{ if(e.target===e.currentTarget) close(); }}>
        <div className="dw">
          <div className="dw-hdr">
            <div>
              <div className="dw-title">{c.nome}</div>
              <div className="dw-sub">
                {grupo?.label || "Cliente"} · {fmt(parseFloat(c.valor)||0)}/mês
                {tempo && <> · cliente há {tempo}</>}
              </div>
            </div>
            <button className="dw-x" onClick={close} title="Fechar">×</button>
          </div>

          <div className="dw-body">
            {/* Alertas automáticos */}
            {alerts.length > 0 && (
              <div className="dw-sec" style={{gap:7}}>
                <div className="dw-sec-t">Alertas</div>
                <div className="pn-alerts" style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>
                  {alerts.map((a,i)=><span key={i} className={`pn-chip ${a.level}`}>{a.text}</span>)}
                </div>
              </div>
            )}

            {/* Dados gerais */}
            <div className="dw-sec">
              <div className="dw-sec-t">Dados gerais</div>
              <div className="dw-grid">
                {F("Empresa","empresa")}
                {F("Segmento","segmento")}
                {F("Responsável","responsavel")}
                {F("Data de entrada","dataEntrada","date")}
                {F("E-mail","email","email")}
                {F("WhatsApp","whatsapp")}
              </div>
            </div>

            {/* Financeiro (manual) */}
            <div className="dw-sec">
              <div className="dw-sec-t">Financeiro</div>
              <div className="dw-f full">
                <label className="dw-lbl">Status financeiro</label>
                <div className="dw-seg">
                  {FIN_OPTS.map(o=>(
                    <button key={o.v} className={`dw-seg-b${crm.statusFinanceiro===o.v?" on":""}`}
                      style={crm.statusFinanceiro===o.v?{background:o.cor}:{}}
                      onClick={()=>set({statusFinanceiro: crm.statusFinanceiro===o.v?"":o.v})}>{o.dot} {o.lbl}</button>
                  ))}
                </div>
              </div>
              <div className="dw-grid">
                {F("Forma de pagamento","formaPagamento","text","Pix, Boleto, Cartão...")}
                {F("Dia de vencimento","diaVencimento","number","Ex: 5")}
                {F("Próximo vencimento","proximoVencimento","date")}
                {F("Último pagamento","ultimoPagamento","date")}
              </div>
              <div style={{fontSize:11,color:"var(--muted)"}}>
                Valor mensal vem da receita ({fmt(parseFloat(c.valor)||0)}). Edite em <a style={{color:"#1a5fa0",cursor:"pointer"}} onClick={()=>{close();setActiveTab("ativos");}}>Receitas</a>. Integração Asaas: fase 2.
              </div>
            </div>

            {/* Relacionamento */}
            <div className="dw-sec">
              <div className="dw-sec-t">Relacionamento</div>
              <div className="dw-grid">
                {F("Última reunião","ultimaReuniao","date")}
                {F("Próxima reunião","proximaReuniao","date")}
                {F("Último contato","ultimoContato","date")}
              </div>
              <div className="dw-f full">
                <label className="dw-lbl">Temperatura da conta</label>
                <div className="dw-temp-row">
                  {TEMP_OPTS.map(o=>(
                    <button key={o.v} className={`dw-temp-b${crm.temperatura===o.v?" on":""}`} title={o.lbl}
                      onClick={()=>set({temperatura: crm.temperatura===o.v?"":o.v})}>{o.emoji}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Operação */}
            <div className="dw-sec">
              <div className="dw-sec-t">Operação</div>
              <div className="dw-f full">
                <label className="dw-lbl">Saúde da conta</label>
                <div className="dw-seg">
                  {SAUDE_OPTS.map(o=>(
                    <button key={o.v} className={`dw-seg-b${crm.saude===o.v?" on":""}`}
                      style={crm.saude===o.v?{background:o.cor}:{}}
                      onClick={()=>set({saude: crm.saude===o.v?"":o.v})}>{o.dot} {o.lbl}</button>
                  ))}
                </div>
              </div>
              <div className="dw-grid">
                <div className="dw-f">
                  <label className="dw-lbl">Contrato assinado</label>
                  <div className="dw-seg">
                    <button className={`dw-seg-b${crm.contratoAssinado==="sim"?" on":""}`} style={crm.contratoAssinado==="sim"?{background:"#1a6e1a"}:{}} onClick={()=>set({contratoAssinado:"sim"})}>Sim</button>
                    <button className={`dw-seg-b${crm.contratoAssinado==="nao"?" on":""}`} style={crm.contratoAssinado==="nao"?{background:"var(--red)"}:{}} onClick={()=>set({contratoAssinado:"nao"})}>Não</button>
                  </div>
                </div>
                {F("Data de renovação","dataRenovacao","date")}
              </div>
              <div className="dw-f full">
                <label className="dw-lbl">Serviços contratados</label>
                <textarea className="dw-in" placeholder="Ex: Tráfego pago, gestão de redes..." value={crm.servicos||""} onChange={e=>set({servicos:e.target.value})}/>
              </div>
              <div className="dw-f full">
                <label className="dw-lbl">Observações internas</label>
                <textarea className="dw-in" value={crm.obsInternas||""} onChange={e=>set({obsInternas:e.target.value})}/>
              </div>
            </div>

            {/* Links rápidos */}
            <div className="dw-sec">
              <div className="dw-sec-t">Links rápidos</div>
              {quickLinks.length > 0 && (
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {quickLinks.map(l=>(
                    <a key={l.k} className="dw-link" href={l.url} target="_blank" rel="noreferrer">{l.lbl}</a>
                  ))}
                </div>
              )}
              <div className="dw-grid">
                {FL("Pasta do Drive","drive","https://drive.google.com/...")}
                {FL("Contrato","contrato","https://...")}
                {FL("Dashboard","dashboard","https://...")}
                {FL("Grupo WhatsApp","grupo","https://chat.whatsapp.com/...")}
              </div>
              <div className="dw-f full">
                <label className="dw-lbl">Ferramentas relacionadas (uma por linha)</label>
                <textarea className="dw-in" placeholder="https://..." value={links.ferramentas||""} onChange={e=>setLink("ferramentas",e.target.value)}/>
                {ferramentas.length>0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
                    {ferramentas.map((u,i)=><a key={i} className="dw-link" href={u} target="_blank" rel="noreferrer">🔗 {u}</a>)}
                  </div>
                )}
              </div>
            </div>

            {/* Histórico de atualizações */}
            <div className="dw-sec">
              <div className="dw-sec-t">Histórico de atualizações</div>
              <div className="dw-add">
                <input className="dw-in" placeholder="Ex: Reunião realizada" value={painelHistText}
                  onChange={e=>setPainelHistText(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") addHist(); }}/>
                <button className="btn btn-p btn-sm" onClick={addHist}>Add</button>
              </div>
              {(crm.historico||[]).length === 0
                ? <div style={{fontSize:12,color:"var(--muted)",fontStyle:"italic"}}>Nenhum registro ainda.</div>
                : <div className="dw-hist">
                    {(crm.historico||[]).map((h,i)=>(
                      <div className="dw-hist-item" key={i}>
                        <span className="dw-hist-date">{fmtData(h.data)}</span>
                        <span>{h.texto}</span>
                        <button className="dw-hist-x" title="Remover" onClick={()=>{
                          const nh = (crm.historico||[]).filter((_,j)=>j!==i); set({historico:nh});
                        }}>×</button>
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Alertas manuais */}
            <div className="dw-sec">
              <div className="dw-sec-t">Alertas manuais</div>
              <div className="dw-chip-add">
                {["Problema operacional","Cliente insatisfeito","Pendência interna"].map(t=>(
                  <button key={t} className="pn-fbtn" onClick={()=>{
                    const cur = crm.alertasManuais||[];
                    if (!cur.includes(t)) set({alertasManuais:[...cur,t]});
                  }}>+ {t}</button>
                ))}
              </div>
              {(crm.alertasManuais||[]).length>0 && (
                <div className="pn-alerts" style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>
                  {(crm.alertasManuais||[]).map((t,i)=>(
                    <span key={i} className="pn-chip warn" style={{cursor:"pointer"}} title="Clique para remover"
                      onClick={()=>set({alertasManuais:(crm.alertasManuais||[]).filter((_,j)=>j!==i)})}>{t} ✕</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );

    function addHist() {
      const txt = painelHistText.trim();
      if (!txt) return;
      const hojeISO = new Date().toISOString().slice(0,10);
      set({ historico: [{ data: hojeISO, texto: txt }, ...(crm.historico||[]) ] });
      setPainelHistText("");
    }
  }

  // ── LTV DE CLIENTES ────────────────────────────────────────
  function renderLTV() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    // Junta clientes de 2026 e 2027 (cada receita = uma entrada)
    const entradas = [];
    [[2026, data26],[2027, data27]].forEach(([yr, dd]) => {
      (dd?.clientes||[]).forEach(c => entradas.push({ c, yr }));
    });

    // Data de início padrão: derivada do ano + mês de início cadastrado na receita
    const defInicio = (c, yr) => {
      const i = parseInt(c.inicio)||0;
      const mes0 = yr===2026 ? 3+i : i; // 2026 começa em Abril (índice 3 do calendário)
      return new Date(yr, mes0, 1);
    };

    const addM = (d, n) => new Date(d.getFullYear(), d.getMonth()+n, 1);
    const mIdx = (d) => d.getFullYear()*12 + d.getMonth();

    const rows = entradas.map(({c, yr}) => {
      const crm = getCrm(c.id);
      // Vendas avulsas somam no LTV
      const avulsas = crm.produtosVendidos || [];
      const avulsasTotal = avulsas.reduce((a,p)=>a+(parseFloat(p.valor)||0),0);
      const pr = Array.isArray(c.produtosContratados) && c.produtosContratados.length ? c.produtosContratados : null;
      const mesDate = (i) => { const x=parseInt(i)||0; return new Date(yr, yr===2026?3+x:x, 1); };

      let di, fim, mesesAtivos, valor, ltv, ltvContrato;
      if (pr) {
        // Cliente com produtos contratados: LTV = soma do acumulado de cada produto
        let ltvProds = 0, contratoTotal = 0, valorAtual = 0, temRecorrente = false;
        let minIni = null, maxFim = null;
        pr.forEach(p=>{
          const ini = mesDate(p.inicio);
          const par = parseInt(p.parcelas)||0;
          const pFim = par>0 ? addM(ini, par-1) : null;
          if (!pFim) temRecorrente = true; else if (!maxFim || mIdx(pFim)>mIdx(maxFim)) maxFim = pFim;
          if (!minIni || mIdx(ini)<mIdx(minIni)) minIni = ini;
          const ate = pFim && mIdx(pFim)<mIdx(hoje) ? pFim : hoje;
          let m = mIdx(ate)-mIdx(ini)+1; if (m<0) m=0;
          if (par>0) m = Math.min(m, par);
          const v = parseFloat(p.valor)||0;
          ltvProds += m*v;
          if (par>0) contratoTotal += par*v;
          if (mIdx(hoje)>=mIdx(ini) && (!pFim || mIdx(hoje)<=mIdx(pFim))) valorAtual += v;
        });
        di = minIni || hoje;
        fim = temRecorrente ? null : maxFim; // com produto recorrente, o cliente não "vence"
        const ate = fim && mIdx(fim)<mIdx(hoje) ? fim : hoje;
        mesesAtivos = Math.max(0, mIdx(ate)-mIdx(di)+1);
        valor = valorAtual;
        ltv = ltvProds + avulsasTotal;
        ltvContrato = temRecorrente ? null : contratoTotal;
      } else {
        // Legado: valor único + parcelas do cadastro da receita
        const par = parseInt(c.parcelas)||0;
        // Término SEMPRE derivado do cadastro (bate com a aba Receitas)
        const iniCadastro = defInicio(c, yr);
        fim = par>0 ? addM(iniCadastro, par-1) : null;
        // Início manual (CRM) só estende a contagem de meses (aumenta o LTV)
        const diRaw = crm.dataEntrada ? new Date(crm.dataEntrada+"T00:00:00") : iniCadastro;
        di = isNaN(diRaw) ? iniCadastro : diRaw;
        const ate = fim && mIdx(fim) < mIdx(hoje) ? fim : hoje;
        mesesAtivos = Math.max(0, mIdx(ate) - mIdx(di) + 1);
        valor = parseFloat(c.valor)||0;
        ltv = mesesAtivos * valor + avulsasTotal;
        ltvContrato = par===0 ? null : par * valor;
      }
      const mesesRestantes = fim ? mIdx(fim) - mIdx(hoje) : null; // null = recorrente
      const encerrado = fim ? mesesRestantes < 0 : false;
      // Semáforo de renovação: vermelho = vence este mês | amarelo = vence em até 2 meses
      const venc = !fim ? "none" : mesesRestantes < 0 ? "past" : mesesRestantes === 0 ? "vermelho" : mesesRestantes <= 2 ? "amarelo" : "ok";
      return { c, yr, crm, di, fim, mesesAtivos, mesesRestantes, valor, prodTotal: avulsasTotal, nProd: avulsas.length, nContratados: pr?pr.length:0, isProd: !!pr, ltv, ltvContrato, encerrado, venc };
    });

    const view = rows.filter(r => {
      if (ltvFiltro === "ativos") return r.c.status === "ativo" && !r.encerrado;
      if (ltvFiltro === "inativos") return r.c.status !== "ativo" || r.encerrado;
      return true;
    });

    // KPIs gerais (sobre todos, não sobre o filtro)
    const ativos = rows.filter(r => r.c.status === "ativo" && !r.encerrado);
    const ltvTotal = rows.reduce((a,r)=>a+r.ltv, 0);
    const ltvMedio = rows.length ? ltvTotal/rows.length : 0;
    const ticketMedio = ativos.length ? ativos.reduce((a,r)=>a+r.valor,0)/ativos.length : 0;
    const tempoMedio = rows.length ? rows.reduce((a,r)=>a+r.mesesAtivos,0)/rows.length : 0;
    const mrrAtivo = ativos.reduce((a,r)=>a+r.valor, 0);
    const aRenovar = rows.filter(r => r.venc === "vermelho" || r.venc === "amarelo").length;

    const dataISO = (d) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";
    const fmtInicio = (d) => d ? `${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}` : "—";

    const filtros = [
      { v:"todos",    l:`Todos (${rows.length})` },
      { v:"ativos",   l:`Ativos (${ativos.length})` },
      { v:"inativos", l:`Inativos/encerrados (${rows.length-ativos.length})` },
    ];

    return (
      <>
        <div className="pg-title">LTV de Clientes</div>
        <div className="pg-sub">Lifetime Value calculado do início do contrato até o mês atual ({String(hoje.getMonth()+1).padStart(2,"0")}/{hoje.getFullYear()}). Ajuste a data de início direto no card.</div>

        {/* KPIs */}
        <div className="cards-row" style={{gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))"}}>
          <div className="card"><div className="stat-lbl">Clientes</div><div className="stat-val">{rows.length}</div><div className="stat-sub">{ativos.length} ativo{ativos.length!==1?"s":""}</div></div>
          <div className="card"><div className="stat-lbl">LTV total</div><div className="stat-val pos">{fmt(ltvTotal)}</div><div className="stat-sub">acumulado até hoje</div></div>
          <div className="card"><div className="stat-lbl">LTV médio</div><div className="stat-val">{fmt(ltvMedio)}</div><div className="stat-sub">por cliente</div></div>
          <div className="card"><div className="stat-lbl">Ticket médio</div><div className="stat-val">{fmt(ticketMedio)}</div><div className="stat-sub">mensal · ativos</div></div>
          <div className="card"><div className="stat-lbl">Tempo médio</div><div className="stat-val">{tempoMedio.toFixed(1)}</div><div className="stat-sub">meses de contrato</div></div>
          <div className="card"><div className="stat-lbl">Receita mensal ativa</div><div className="stat-val pos">{fmt(mrrAtivo)}</div><div className="stat-sub">soma dos ativos</div></div>
          <div className="card"><div className="stat-lbl">Produtos vendidos</div><div className="stat-val pos">{fmt(rows.reduce((a,r)=>a+r.prodTotal,0))}</div><div className="stat-sub">{rows.reduce((a,r)=>a+r.nProd,0)} venda(s) · soma no LTV</div></div>
          <div className="card" style={aRenovar?{borderColor:"#e0c880",background:"var(--warn-bg)"}:{}}><div className="stat-lbl">A renovar</div><div className="stat-val" style={{color:aRenovar?"var(--warn)":"var(--text)"}}>{aRenovar}</div><div className="stat-sub">vencendo em até 2 meses</div></div>
        </div>

        <div className="pn-filters">
          {filtros.map(f => (
            <button key={f.v} className={`pn-fbtn${ltvFiltro===f.v?" on":""}`} onClick={()=>setLtvFiltro(f.v)}>{f.l}</button>
          ))}
        </div>

        {view.length === 0 ? (
          <div className="pn-empty">Nenhum cliente neste filtro. Cadastre receitas na aba <strong>Receitas</strong> ou feche leads no <strong>Kanban</strong>.</div>
        ) : (
          <>
            {/* CARDS INDIVIDUAIS */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:12,marginBottom:20}}>
              {view.map((r,ri)=>{
                const g = GRUPOS.find(g=>g.key===(r.c.tipoReceita||"cliente"));
                const vencStyle = r.venc==="vermelho" ? {border:"1.5px solid #d08080",background:"var(--red-bg)"}
                  : r.venc==="amarelo" ? {border:"1.5px solid #e0c880",background:"var(--warn-bg)"}
                  : {borderColor:(g?.brd)||"var(--border)"};
                return (
                  <div key={r.c.id||ri} className="card" style={{...vencStyle,display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:g?.cor||"#888",flexShrink:0}}/>
                      <span style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}} title={r.c.nome}>{r.c.nome}</span>
                      {r.encerrado
                        ? <span className="badge b-gray">Encerrado</span>
                        : r.c.status!=="ativo" && <span className={`badge ${SBADGE[r.c.status]||"b-gray"}`}>{SLBL[r.c.status]||r.c.status}</span>}
                    </div>
                    {r.venc==="vermelho" && <span className="pn-chip danger" style={{alignSelf:"flex-start"}}>🔴 Vence este mês — renovar contrato!</span>}
                    {r.venc==="amarelo" && <span className="pn-chip warn" style={{alignSelf:"flex-start"}}>🟡 Vence em {r.mesesRestantes} {r.mesesRestantes===1?"mês":"meses"}</span>}
                    <div style={{fontSize:22,fontWeight:700,fontFamily:"var(--mono)",color:"#1a6e1a"}}>{fmt(r.ltv)}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>
                      {r.isProd
                        ? <>{r.nContratados} produto{r.nContratados!==1?"s":""} · {fmt(r.valor)}/mês atual</>
                        : <>{fmt(r.valor)}/mês × {r.mesesAtivos} {r.mesesAtivos===1?"mês":"meses"}</>}
                      {r.prodTotal>0 && <> + <strong style={{color:"#1a6e1a"}}>{fmt(r.prodTotal)}</strong> avulsos</>}
                      {r.ltvContrato!=null && <> · contrato: {fmt(r.ltvContrato)}</>}
                    </div>
                    <div style={{fontSize:11,color:r.venc==="vermelho"?"var(--red)":r.venc==="amarelo"?"var(--warn)":"var(--muted)",fontWeight:r.venc==="vermelho"||r.venc==="amarelo"?600:400}}>
                      Término: {r.fim ? fmtInicio(r.fim) : "recorrente (sem fim)"}
                    </div>
                    {r.isProd ? (
                      <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>
                        Início {fmtInicio(r.di)} — definido pelos produtos contratados
                      </div>
                    ) : (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                        <label style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".05em",flexShrink:0}}>Início</label>
                        <input className="dw-in" type="date" style={{padding:"4px 7px",fontSize:12}}
                          value={crmDataISO(r)}
                          onChange={e=>updateCrm(r.c.id, {dataEntrada: e.target.value})}/>
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,marginTop:2}}>
                      <button className="btn btn-p btn-sm" onClick={()=>setProdCliId(r.c.id)}>
                        🛒 Produtos{(r.nContratados+r.nProd)>0?` (${r.nContratados+r.nProd})`:""}
                      </button>
                      <button className="btn btn-sm"
                        onClick={()=>{setPainelDrawerId(r.c.id);setPainelHistText("");}}>Ver detalhes →</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* TABELA DE KPIs */}
            <div className="sec-label">Todos os clientes — KPIs de LTV</div>
            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  <th style={{textAlign:"left"}}>Cliente</th>
                  <th style={{textAlign:"center"}}>Ano</th>
                  <th style={{textAlign:"center"}}>Início</th>
                  <th style={{textAlign:"center"}}>Término</th>
                  <th>Meses</th>
                  <th>Valor mensal</th>
                  <th>Produtos</th>
                  <th>LTV acumulado</th>
                  <th>LTV contrato</th>
                  <th style={{textAlign:"center"}}>Status</th>
                </tr></thead>
                <tbody>
                  {view.map((r,ri)=>(
                    <tr key={"t"+(r.c.id||ri)} className="pn-row" onClick={()=>{setPainelDrawerId(r.c.id);setPainelHistText("");}}
                      style={r.venc==="vermelho"?{background:"var(--red-bg)"}:r.venc==="amarelo"?{background:"var(--warn-bg)"}:{}}>
                      <td className="pn-cli"><div className="pn-cli-nome">{r.c.nome}</div><div className="pn-cli-sub">{GRUPOS.find(g=>g.key===(r.c.tipoReceita||"cliente"))?.label||"—"}</div></td>
                      <td className="pn-td">{r.yr}</td>
                      <td className="pn-td">{fmtInicio(r.di)}</td>
                      <td className="pn-td" style={r.venc==="vermelho"?{color:"var(--red)",fontWeight:600}:r.venc==="amarelo"?{color:"var(--warn)",fontWeight:600}:{}}>
                        {r.fim?fmtInicio(r.fim):"—"}{r.venc==="vermelho"?" 🔴":r.venc==="amarelo"?" 🟡":""}
                      </td>
                      <td className="td-n">{r.mesesAtivos}</td>
                      <td className="td-n">{fmt(r.valor)}</td>
                      <td className="td-n pos">{r.prodTotal>0?fmt(r.prodTotal):"—"}</td>
                      <td className="td-s pos">{fmt(r.ltv)}</td>
                      <td className="td-n">{r.ltvContrato!=null?fmt(r.ltvContrato):"recorrente"}</td>
                      <td className="pn-td">{r.encerrado?<span className="badge b-gray">Encerrado</span>:<span className={`badge ${SBADGE[r.c.status]||"b-gray"}`}>{SLBL[r.c.status]||r.c.status}</span>}</td>
                    </tr>
                  ))}
                  <tr style={{background:"var(--surface)",borderTop:"2px solid var(--border2)"}}>
                    <td className="td-m" style={{fontSize:11,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em"}}>Total ({view.length})</td>
                    <td/><td/><td/>
                    <td className="td-n" style={{fontWeight:600}}>{view.reduce((a,r)=>a+r.mesesAtivos,0)}</td>
                    <td className="td-n" style={{fontWeight:600}}>{fmt(view.reduce((a,r)=>a+r.valor,0))}</td>
                    <td className="td-n pos" style={{fontWeight:600}}>{fmt(view.reduce((a,r)=>a+r.prodTotal,0))}</td>
                    <td className="td-s pos" style={{fontWeight:700}}>{fmt(view.reduce((a,r)=>a+r.ltv,0))}</td>
                    <td className="td-n" style={{fontWeight:600}}>{fmt(view.reduce((a,r)=>a+(r.ltvContrato||0),0))}</td>
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    );

    // Data no formato do input date: usa a do CRM se houver, senão a derivada do cadastro
    function crmDataISO(r) {
      if (r.crm.dataEntrada) return r.crm.dataEntrada;
      return dataISO(r.di);
    }
  }

  // ── RENDER ACTIVE TAB ──────────────────────────────────────
  function renderTab() {
    if (activeTab === "fluxo") return (
      <>
        {ano===2027&&carryover!==null&&<div className="carry-banner">Caixa inicial herdado de dezembro/2026: <strong style={{fontFamily:"var(--mono)",marginLeft:4}}>{fmt(carryover)}</strong></div>}
        <div className="sec-label" style={{marginTop:0}}>Mês a mês</div>
        {renderFluxo()}
        <hr className="dv"/>
        {renderResumoMes()}
      </>
    );
    if (activeTab === "empresa") return renderEmpresa();
    if (activeTab === "add-conta") return <AddContaForm />;
    if (activeTab === "clientes") return <AddClienteForm />;
    if (activeTab === "ativos") return renderAtivos();
    if (activeTab === "ltv") return renderLTV();
    if (activeTab === "kanban") return renderKanban();
    if (activeTab === "produtos") return <ProdutosTab />;
    if (activeTab === "categorias") return renderCategorias();
  }

  // Inline form components to access outer state via closure
  function AddContaForm() {
    const [form, setForm] = useState({nome:"",catIdx:empCard??0,tag:"",valor:"",inicio:0,parcelas:0,vencimento:""});
    return (
      <>
        <div className="pg-title">Adicionar conta</div>
        <div className="pg-sub">Defina nome, grupo, categoria de análise, valor, mês de início e parcelas.</div>
        <div className="form-wrap">
          <div className="fg">
            <div className="fl"><label className="flabel">Nome</label><input className="fi" value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Nubank fatura"/></div>
            <div className="fl"><label className="flabel">Grupo</label>
              <select className="fi" value={form.catIdx} onChange={e=>setForm(p=>({...p,catIdx:parseInt(e.target.value)}))}>
                {D.categorias.map((c,i)=><option key={i} value={i}>{c.nome}</option>)}
              </select></div>
            <div className="fl"><label className="flabel">Categoria (análise)</label>
              <select className="fi" value={form.tag} onChange={e=>setForm(p=>({...p,tag:e.target.value}))}>
                <option value="">— selecione —</option>
                {catsAnalise.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <span style={{fontSize:10,color:"var(--muted)"}}>Configure as categorias no menu Categorias 🏷️</span></div>
            <div className="fl"><label className="flabel">Valor (R$)</label><input className="fi" type="number" value={form.valor} onChange={e=>setForm(p=>({...p,valor:e.target.value}))} placeholder="500"/></div>
            <div className="fl"><label className="flabel">Mês de início</label>
              <select className="fi" value={form.inicio} onChange={e=>setForm(p=>({...p,inicio:parseInt(e.target.value)}))}>
                {ms.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select></div>
            <div className="fl"><label className="flabel">Parcelas</label>
              <select className="fi" value={form.parcelas} onChange={e=>setForm(p=>({...p,parcelas:parseInt(e.target.value)}))}>
                {[1,2,3,4,5,6,9,12].map(n=><option key={n} value={n}>{n} {n===1?"mês":"meses"}</option>)}
                <option value={0}>Fixa (sem fim)</option>
              </select></div>
            <div className="fl"><label className="flabel">Vencimento (dia)</label>
              <input className="fi" type="number" min="1" max="31" value={form.vencimento} onChange={e=>setForm(p=>({...p,vencimento:e.target.value}))} placeholder="Ex: 10"/></div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-p" onClick={()=>{
              if(!form.nome||!form.valor){alert("Preencha nome e valor.");return;}
              if(!form.tag.trim()){alert("Informe a categoria de análise da conta.");return;}
              update(d=>{d.categorias[form.catIdx].contas.push({nome:form.nome,tag:form.tag.trim(),valor:parseFloat(form.valor),inicio:form.inicio,parcelas:form.parcelas,vencimento:form.vencimento||"",status:"ativo"});return d;});
              setEmpCard(form.catIdx);
              setActiveTab("empresa");
              showToast("Conta adicionada!");
            }}>+ Adicionar</button>
            <button className="btn" onClick={()=>setActiveTab("empresa")}>Cancelar</button>
          </div>
        </div>
      </>
    );
  }

  function EditContaForm({ci, cti, conta, onDone}) {
    const [form, setForm] = useState({
      nome: conta.nome||"",
      catIdx: ci,
      tag: conta.tag||"",
      valor: conta.valor||"",
      inicio: conta.inicio??0,
      parcelas: conta.parcelas??0,
      vencimento: conta.vencimento||"",
    });
    return (
      <div className="form-wrap" style={{border:"1.5px solid #e0b0b0",background:"#fff8f8"}}>
        <div style={{fontWeight:600,fontSize:13,marginBottom:12,color:"var(--red)"}}>Editando: {conta.nome}</div>
        <div className="fg">
          <div className="fl"><label className="flabel">Nome</label>
            <input className="fi" value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))}/></div>
          <div className="fl"><label className="flabel">Mover para grupo</label>
            <select className="fi" value={form.catIdx} onChange={e=>setForm(p=>({...p,catIdx:parseInt(e.target.value)}))}>
              {D.categorias.map((c,i)=><option key={i} value={i}>{c.nome}</option>)}
            </select></div>
          <div className="fl"><label className="flabel">Categoria (análise)</label>
            <select className="fi" value={form.tag} onChange={e=>setForm(p=>({...p,tag:e.target.value}))}>
              <option value="">— selecione —</option>
              {catsAnalise.map(t=><option key={t} value={t}>{t}</option>)}
            </select></div>
          <div className="fl"><label className="flabel">Valor (R$)</label>
            <input className="fi" type="number" value={form.valor} onChange={e=>setForm(p=>({...p,valor:e.target.value}))}/></div>
          <div className="fl"><label className="flabel">Mês de início</label>
            <select className="fi" value={form.inicio} onChange={e=>setForm(p=>({...p,inicio:parseInt(e.target.value)}))}>
              {ms.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select></div>
          <div className="fl"><label className="flabel">Parcelas</label>
            <select className="fi" value={form.parcelas} onChange={e=>setForm(p=>({...p,parcelas:parseInt(e.target.value)}))}>
              {[1,2,3,4,5,6,9,12].map(n=><option key={n} value={n}>{n} {n===1?"mês":"meses"}</option>)}
              <option value={0}>Recorrente</option>
            </select></div>
          <div className="fl"><label className="flabel">Vencimento (dia)</label>
            <input className="fi" type="number" min="1" max="31" value={form.vencimento} onChange={e=>setForm(p=>({...p,vencimento:e.target.value}))} placeholder="Ex: 10"/></div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-p" onClick={()=>{
            if(!form.nome||!form.valor){alert("Preencha nome e valor.");return;}
            if(!form.tag.trim()){alert("Informe a categoria de análise da conta.");return;}
            update(d=>{
              const ct={...d.categorias[ci].contas[cti],...form,tag:form.tag.trim(),valor:parseFloat(form.valor)};
              if(form.catIdx!==ci){
                d.categorias[ci].contas.splice(cti,1);
                d.categorias[form.catIdx].contas.push(ct);
                setEmpCard(form.catIdx);
              } else {
                d.categorias[ci].contas[cti]=ct;
              }
              return d;
            });
            onDone();
            showToast("Salvo!");
          }}>Salvar</button>
          <button className="btn" onClick={onDone}>Cancelar</button>
        </div>
      </div>
    );
  }

  function AddClienteForm() {
    const [form, setForm] = useState({nome:"",tipoReceita:"cliente",tipo:"assessor",valor:"",inicio:ano===2026?1:0,parcelas:0,status:"ativo",vencimento:""});
    const TIPOS={assessor:"Assessor — consórcio",trafego:"Tráfego pago",ecossistema:"Ecossistema completo",consorcio:"Consórcio próprio",outro:"Outro"};
    return (
      <>
        <div className="pg-title">Adicionar receita</div>
        <div className="pg-sub">Defina o tipo, nome, valor, mês de início e parcelas.</div>
        <div className="form-wrap">
          <div className="fg">
            <div className="fl"><label className="flabel">Tipo de receita</label>
              <select className="fi" value={form.tipoReceita} onChange={e=>setForm(p=>({...p,tipoReceita:e.target.value}))}>
                <option value="cliente">Cliente</option>
                <option value="servico">Serviço</option>
                <option value="comissao">Comissão</option>
              </select></div>
            <div className="fl"><label className="flabel">Nome</label><input className="fi" value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Assessor João"/></div>
            <div className="fl"><label className="flabel">Subtipo</label>
              <select className="fi" value={form.tipo} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}>
                {Object.entries(TIPOS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="fl"><label className="flabel">Valor (R$)</label><input className="fi" type="number" value={form.valor} onChange={e=>setForm(p=>({...p,valor:e.target.value}))} placeholder="2500"/></div>
            <div className="fl"><label className="flabel">Mês de início</label>
              <select className="fi" value={form.inicio} onChange={e=>setForm(p=>({...p,inicio:parseInt(e.target.value)}))}>
                {ms.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select></div>
            <div className="fl"><label className="flabel">Parcelas</label>
              <select className="fi" value={form.parcelas} onChange={e=>setForm(p=>({...p,parcelas:parseInt(e.target.value)}))}>
                {[1,2,3,4,5,6,9,12].map(n=><option key={n} value={n}>{n} {n===1?"mês":"meses"}</option>)}
                <option value={0}>Fixa (sem fim)</option>
              </select></div>
            <div className="fl"><label className="flabel">Status</label>
              <select className="fi" value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                <option value="ativo">Ativo</option>
                <option value="proposta">Proposta enviada</option>
                <option value="prospecto">Prospecto</option>
              </select></div>
            <div className="fl"><label className="flabel">Vencimento (dia)</label>
              <input className="fi" type="number" min="1" max="31" value={form.vencimento} onChange={e=>setForm(p=>({...p,vencimento:e.target.value}))} placeholder="Ex: 5"/></div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-p" onClick={()=>{
              if(!form.nome||!form.valor){alert("Preencha nome e valor.");return;}
              const novoId = "cli_"+Math.random().toString(36).slice(2)+Date.now().toString(36);
              update(d=>{d.clientes.push({...form,id:novoId,valor:parseFloat(form.valor)});return d;});
              setAtvCard(form.tipoReceita);
              setActiveTab("ativos");
              setProdCliId(novoId); // abre o modal de produtos do cliente
              showToast("Cliente adicionado! Configure os produtos que ele comprou.");
            }}>+ Adicionar</button>
            <button className="btn" onClick={()=>setActiveTab("ativos")}>Cancelar</button>
          </div>
        </div>
      </>
    );
  }

  function EditItemForm({idx, item, onDone}) {
    const TIPOS={assessor:"Assessor — consórcio",trafego:"Tráfego pago",ecossistema:"Ecossistema completo",consorcio:"Consórcio próprio",outro:"Outro"};
    const [form, setForm] = useState({
      nome: item.nome||"",
      tipoReceita: item.tipoReceita||"cliente",
      tipo: item.tipo||"assessor",
      valor: item.valor||"",
      inicio: item.inicio??0,
      parcelas: item.parcelas??0,
      status: item.status||"ativo",
      vencimento: item.vencimento||"",
    });
    return (
      <div className="form-wrap" style={{border:"1.5px solid #b0ccee",background:"#f5f9ff"}}>
        <div style={{fontWeight:600,fontSize:13,marginBottom:12,color:"#1a5fa0"}}>Editando: {item.nome}</div>
        <div className="fg">
          <div className="fl"><label className="flabel">Tipo de receita</label>
            <select className="fi" value={form.tipoReceita} onChange={e=>setForm(p=>({...p,tipoReceita:e.target.value}))}>
              <option value="cliente">Cliente</option>
              <option value="servico">Serviço</option>
              <option value="comissao">Comissão</option>
            </select></div>
          <div className="fl"><label className="flabel">Nome</label>
            <input className="fi" value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))}/></div>
          <div className="fl"><label className="flabel">Subtipo</label>
            <select className="fi" value={form.tipo} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}>
              {Object.entries(TIPOS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select></div>
          <div className="fl"><label className="flabel">Valor (R$)</label>
            <input className="fi" type="number" value={form.valor} onChange={e=>setForm(p=>({...p,valor:e.target.value}))}/></div>
          <div className="fl"><label className="flabel">Mês de início</label>
            <select className="fi" value={form.inicio} onChange={e=>setForm(p=>({...p,inicio:parseInt(e.target.value)}))}>
              {ms.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select></div>
          <div className="fl"><label className="flabel">Parcelas</label>
            <select className="fi" value={form.parcelas} onChange={e=>setForm(p=>({...p,parcelas:parseInt(e.target.value)}))}>
              {[1,2,3,4,5,6,9,12].map(n=><option key={n} value={n}>{n} {n===1?"mês":"meses"}</option>)}
              <option value={0}>Recorrente</option>
            </select></div>
          <div className="fl"><label className="flabel">Status</label>
            <select className="fi" value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
              <option value="ativo">Ativo</option>
              <option value="proposta">Proposta enviada</option>
              <option value="prospecto">Prospecto</option>
            </select></div>
          <div className="fl"><label className="flabel">Vencimento (dia)</label>
            <input className="fi" type="number" min="1" max="31" value={form.vencimento} onChange={e=>setForm(p=>({...p,vencimento:e.target.value}))} placeholder="Ex: 5"/></div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-p" onClick={()=>{
            if(!form.nome||!form.valor){alert("Preencha nome e valor.");return;}
            update(d=>{d.clientes[idx]={...d.clientes[idx],...form,valor:parseFloat(form.valor)};return d;});
            if(form.tipoReceita!==item.tipoReceita) setAtvCard(form.tipoReceita);
            onDone();
            showToast("Salvo!");
          }}>Salvar</button>
          <button className="btn" onClick={()=>{onDone();setProdCliId(item.id);}}>🛒 Produtos do cliente</button>
          <button className="btn" onClick={onDone}>Cancelar</button>
        </div>
      </div>
    );
  }

  // ── CATEGORIAS DE ANÁLISE (config) ─────────────────────────
  function renderCategorias() {
    const configuradas = dataKanban?.categoriasAnalise || [];
    const emUso = tagsDespesa.filter(t=>!configuradas.includes(t));
    return (
      <>
        <div className="pg-title">Categorias de análise 🏷️</div>
        <div className="pg-sub">Categorias usadas para classificar as contas de despesa de qualquer grupo. Elas alimentam o painel "Gastos por categoria" da aba Despesas.</div>

        <div className="form-wrap">
          <div className="sec-label" style={{marginTop:0}}>Configuradas ({configuradas.length})</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:6}}>
            {configuradas.length===0 && <span style={{fontSize:13,color:"var(--muted)",fontStyle:"italic"}}>Nenhuma categoria configurada ainda.</span>}
            {configuradas.map(t=>(
              <span key={t} className="pn-sem" style={{background:"#eef4fb",color:"#1a4a7a",cursor:"pointer"}} title="Clique para remover da lista"
                onClick={()=>{if(confirm(`Remover a categoria "${t}" da lista? (as contas já classificadas não são alteradas)`))updateKanban(d=>{d.categoriasAnalise=(d.categoriasAnalise||[]).filter(x=>x!==t);return d;});}}>
                {t} ✕
              </span>
            ))}
            <button className="btn btn-p btn-sm" onClick={()=>{
              const nome=prompt("Nome da nova categoria de análise:");
              if(!nome||!nome.trim())return;
              updateKanban(d=>{const arr=d.categoriasAnalise||[];if(!arr.includes(nome.trim()))d.categoriasAnalise=[...arr,nome.trim()].sort();return d;});
            }}>+ Nova categoria</button>
          </div>
          {emUso.length>0 && (
            <>
              <div className="sec-label">Em uso nas contas (não configuradas)</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                {emUso.map(t=>(
                  <span key={"u"+t} className="pn-sem" style={{background:"var(--surface)",color:"var(--muted)",cursor:"pointer"}} title="Clique para adicionar à lista configurada"
                    onClick={()=>updateKanban(d=>{const arr=d.categoriasAnalise||[];if(!arr.includes(t))d.categoriasAnalise=[...arr,t].sort();return d;})}>
                    {t} +
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  // ── PRODUTOS (catálogo) ────────────────────────────────────
  function ProdutosTab() {
    const [form, setForm] = useState({nome:"", valor:""});
    const produtos = dataKanban?.produtos || [];

    // Vendas agregadas por produto (em todos os clientes)
    const vendas = {};
    Object.values(dataKanban?.crm || {}).forEach(cr => (cr.produtosVendidos||[]).forEach(p => {
      const k = p.produtoId || p.nome || "—";
      if(!vendas[k]) vendas[k] = { n:0, total:0 };
      vendas[k].n++; vendas[k].total += parseFloat(p.valor)||0;
    }));
    const totalVendido = Object.values(vendas).reduce((a,v)=>a+v.total,0);
    const nVendas = Object.values(vendas).reduce((a,v)=>a+v.n,0);

    return (
      <>
        <div className="pg-title">Produtos 🛒</div>
        <div className="pg-sub">Catálogo de produtos vendidos aos clientes. As vendas são registradas no bloco de cada cliente (menu LTV) e somam no LTV.</div>

        <div className="cards-row" style={{gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",maxWidth:560}}>
          <div className="card"><div className="stat-lbl">Produtos no catálogo</div><div className="stat-val">{produtos.length}</div></div>
          <div className="card"><div className="stat-lbl">Vendas registradas</div><div className="stat-val">{nVendas}</div></div>
          <div className="card"><div className="stat-lbl">Total vendido</div><div className="stat-val pos">{fmt(totalVendido)}</div></div>
        </div>

        <div className="form-wrap">
          <div className="sec-label" style={{marginTop:0}}>Novo produto</div>
          <div className="fg">
            <div className="fl"><label className="flabel">Nome</label>
              <input className="fi" value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Landing page, Consultoria"/></div>
            <div className="fl"><label className="flabel">Valor padrão (R$)</label>
              <input className="fi" type="number" value={form.valor} onChange={e=>setForm(p=>({...p,valor:e.target.value}))} placeholder="500"/></div>
          </div>
          <button className="btn btn-p" onClick={()=>{
            if(!form.nome.trim()){alert("Informe o nome do produto.");return;}
            updateKanban(d=>{
              d.produtos = [...(d.produtos||[]), {id:"prod_"+Date.now(), nome:form.nome.trim(), valor:parseFloat(form.valor)||0}];
              return d;
            });
            setForm({nome:"",valor:""});
            showToast("Produto adicionado ao catálogo!");
          }}>+ Adicionar produto</button>
        </div>

        {produtos.length===0 ? (
          <div className="pn-empty">Nenhum produto cadastrado ainda.</div>
        ) : (
          <div className="cli-list compact" style={{maxWidth:640}}>
            {produtos.map(p=>{
              const v = vendas[p.id] || vendas[p.nome] || {n:0,total:0};
              return (
                <div className="cli-row" key={p.id}>
                  <div className="cli-row-main">
                    <span className="cli-row-nome">{p.nome}</span>
                    <span className="cli-row-sub">{v.n} venda{v.n!==1?"s":""}{v.total>0?` · ${fmt(v.total)}`:""}</span>
                  </div>
                  <div className="cli-row-actions">
                    <span className="badge b-g">{fmt(parseFloat(p.valor)||0)}</span>
                    <button className="btn-rm" onClick={()=>{if(confirm(`Remover "${p.nome}" do catálogo? (vendas já registradas não são alteradas)`))updateKanban(d=>{d.produtos=(d.produtos||[]).filter(x=>x.id!==p.id);return d;});}}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ── PRODUTOS DE UM CLIENTE (modal 80% da tela) ──────────────
  function ClienteProdutosModal({cliId, onClose}) {
    const found = [[2026,data26],[2027,data27]]
      .map(([yr,dd])=>({yr, c:(dd?.clientes||[]).find(x=>x.id===cliId)}))
      .find(x=>x.c);
    const catalogo = dataKanban?.produtos || [];
    const crm = getCrm(cliId);
    const avulsas = crm.produtosVendidos || [];
    const hojeISO = new Date().toISOString().slice(0,10);
    const [formP, setFormP] = useState({produtoId:"", valor:"", inicio:0, parcelas:0});
    const [formA, setFormA] = useState({produtoId:"", valor:"", data:hojeISO});
    if (!found) return null;
    const { yr, c: cli } = found;
    const msAno = ANOS_CONFIG[yr];
    const contratados = cli.produtosContratados || [];
    const totalMesAtual = contratados.length ? msAno.map((_,mi)=>cliValMes(cli,mi)) : null;
    const totalAvulsas = avulsas.reduce((a,p)=>a+(parseFloat(p.valor)||0),0);

    // Atualiza o cliente no ano correto (pode ser diferente do ano ativo na tela)
    const updateCli = (mut) => {
      const set = yr===2026 ? setData26 : setData27;
      set(prev=>{
        const next = JSON.parse(JSON.stringify(prev));
        const cc = next.clientes.find(x=>x.id===cliId);
        if (cc) mut(cc);
        saveData(next, yr);
        return next;
      });
    };

    const selCat = (setF) => (e) => {
      const p = catalogo.find(x=>x.id===e.target.value);
      setF(f=>({...f, produtoId:e.target.value, valor: p ? p.valor : f.valor}));
    };

    return (
      <div className="edit-modal-ov" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div className="edit-modal">
          <div className="edit-modal-hdr">
            <div>
              <div className="edit-modal-title">🛒 Produtos — {cli.nome}</div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>
                {contratados.length>0
                  ? <>Os produtos abaixo definem a receita mensal deste cliente no fluxo ({yr}).</>
                  : <>Sem produtos, vale o valor único do cadastro ({fmt(parseFloat(cli.valor)||0)}/mês).</>}
              </div>
            </div>
            <button className="dw-x" onClick={onClose} title="Fechar">×</button>
          </div>

          {/* PRODUTOS CONTRATADOS */}
          <div className="dw-sec" style={{marginBottom:14}}>
            <div className="dw-sec-t">Produtos contratados — entram no fluxo e no LTV</div>
            {contratados.length===0
              ? <div style={{fontSize:12,color:"var(--muted)",fontStyle:"italic"}}>Nenhum produto contratado. O fluxo usa o valor único do cadastro.</div>
              : <div className="cli-list compact">
                  {contratados.map(p=>{
                    const par = parseInt(p.parcelas)||0;
                    return (
                      <div className="cli-row" key={p.id}>
                        <div className="cli-row-main">
                          <span className="cli-row-nome">{p.nome}</span>
                          <span className="cli-row-sub">
                            início {msAno[parseInt(p.inicio)||0]||"?"}/{yr} · {par===0?"recorrente":`${par} ${par===1?"mês":"meses"}`}
                          </span>
                        </div>
                        <div className="cli-row-actions">
                          <span className="badge b-g">{fmt(parseFloat(p.valor)||0)}/mês</span>
                          <button className="btn-rm" onClick={()=>{if(confirm(`Remover "${p.nome}" deste cliente?`))updateCli(cc=>{cc.produtosContratados=(cc.produtosContratados||[]).filter(x=>x.id!==p.id);});}}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
            {catalogo.length===0 ? (
              <div className="alert warn" style={{marginBottom:0}}><span className="a-dot"/>Nenhum produto no catálogo. Cadastre primeiro no menu <strong>Produtos 🛒</strong>.</div>
            ) : (
              <>
                <div className="fg">
                  <div className="fl"><label className="flabel">Produto</label>
                    <select className="fi" value={formP.produtoId} onChange={selCat(setFormP)}>
                      <option value="">— selecione —</option>
                      {catalogo.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select></div>
                  <div className="fl"><label className="flabel">Valor mensal (R$)</label>
                    <input className="fi" type="number" value={formP.valor} onChange={e=>setFormP(f=>({...f,valor:e.target.value}))}/></div>
                  <div className="fl"><label className="flabel">Mês de início ({yr})</label>
                    <select className="fi" value={formP.inicio} onChange={e=>setFormP(f=>({...f,inicio:parseInt(e.target.value)}))}>
                      {msAno.map((m,i)=><option key={i} value={i}>{m}</option>)}
                    </select></div>
                  <div className="fl"><label className="flabel">Quanto tempo</label>
                    <select className="fi" value={formP.parcelas} onChange={e=>setFormP(f=>({...f,parcelas:parseInt(e.target.value)}))}>
                      {[1,2,3,4,5,6,9,12].map(n=><option key={n} value={n}>{n} {n===1?"mês":"meses"}</option>)}
                      <option value={0}>Recorrente (sem fim)</option>
                    </select></div>
                </div>
                <button className="btn btn-p" style={{alignSelf:"flex-start"}} onClick={()=>{
                  const p = catalogo.find(x=>x.id===formP.produtoId);
                  if(!p){alert("Selecione um produto.");return;}
                  const item = {id:"cp_"+Date.now(), produtoId:p.id, nome:p.nome, valor:parseFloat(formP.valor)||0, inicio:formP.inicio, parcelas:formP.parcelas};
                  updateCli(cc=>{cc.produtosContratados=[...(cc.produtosContratados||[]), item];});
                  showToast(`${p.nome} contratado por ${cli.nome}!`);
                }}>+ Adicionar produto</button>
              </>
            )}
            {totalMesAtual && (
              <div style={{fontSize:11,color:"var(--muted)"}}>
                Receita mensal resultante: {msAno.map((m,mi)=>totalMesAtual[mi]>0?`${m.substring(0,3)} ${fmt(totalMesAtual[mi])}`:null).filter(Boolean).join(" · ")||"—"}
              </div>
            )}
          </div>

          {/* VENDAS AVULSAS */}
          <div className="dw-sec">
            <div className="dw-sec-t">Vendas avulsas — somam só no LTV ({fmt(totalAvulsas)})</div>
            {avulsas.length===0
              ? <div style={{fontSize:12,color:"var(--muted)",fontStyle:"italic"}}>Nenhuma venda avulsa registrada.</div>
              : <div className="cli-list compact">
                  {[...avulsas].reverse().map(p=>(
                    <div className="cli-row" key={p.id}>
                      <div className="cli-row-main">
                        <span className="cli-row-nome">{p.nome}</span>
                        <span className="cli-row-sub">{fmtData(p.data)}</span>
                      </div>
                      <div className="cli-row-actions">
                        <span className="badge b-g">{fmt(parseFloat(p.valor)||0)}</span>
                        <button className="btn-rm" onClick={()=>{if(confirm("Remover esta venda?"))updateCrm(cliId,{produtosVendidos:avulsas.filter(x=>x.id!==p.id)});}}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
            }
            {catalogo.length>0 && (
              <>
                <div className="fg">
                  <div className="fl"><label className="flabel">Produto</label>
                    <select className="fi" value={formA.produtoId} onChange={selCat(setFormA)}>
                      <option value="">— selecione —</option>
                      {catalogo.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select></div>
                  <div className="fl"><label className="flabel">Valor (R$)</label>
                    <input className="fi" type="number" value={formA.valor} onChange={e=>setFormA(f=>({...f,valor:e.target.value}))}/></div>
                  <div className="fl"><label className="flabel">Data</label>
                    <input className="fi" type="date" value={formA.data} onChange={e=>setFormA(f=>({...f,data:e.target.value}))}/></div>
                </div>
                <button className="btn btn-sm" style={{alignSelf:"flex-start"}} onClick={()=>{
                  const p = catalogo.find(x=>x.id===formA.produtoId);
                  if(!p){alert("Selecione um produto.");return;}
                  const item = {id:"pv_"+Date.now(), produtoId:p.id, nome:p.nome, valor:parseFloat(formA.valor)||0, data:formA.data};
                  updateCrm(cliId, {produtosVendidos:[...avulsas, item]});
                  showToast(`Venda de ${p.nome} registrada!`);
                }}>+ Registrar venda avulsa</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── PRODUTOS NEGOCIADOS DE UM LEAD (seção do modal do Kanban) ──
  function LeadProdutos({form, lead}) {
    const catalogo = dataKanban?.produtos || [];
    const [f, setF] = useState({produtoId:"", valor:"", parcelas:3});
    const prods = form.produtosNegociados || [];
    const total = prods.reduce((a,p)=>a+(parseFloat(p.valor)||0),0);

    const setProds = (arr) => {
      const atualizado = { ...form, produtosNegociados: arr };
      setKanbanEditForm(atualizado);
      updateKanban(d=>{
        const idx = d.leads.findIndex(l=>l.id===lead.id);
        if (idx>=0) d.leads[idx] = { ...d.leads[idx], produtosNegociados: arr };
        return d;
      });
    };

    return (
      <div className="modal-section">
        <div className="modal-section-title">
          Produtos negociados
          {prods.length>0 && <span style={{marginLeft:8,fontSize:10,color:"#1a6e1a",fontWeight:600,textTransform:"none"}}>{prods.length} produto(s) · {fmt(total)}/mês</span>}
        </div>
        {prods.length===0
          ? <div style={{fontSize:12,color:"var(--muted)",fontStyle:"italic"}}>Nenhum produto negociado ainda.</div>
          : <div className="cli-list compact">
              {prods.map(p=>{
                const par = parseInt(p.parcelas)||0;
                return (
                  <div className="cli-row" key={p.id}>
                    <div className="cli-row-main">
                      <span className="cli-row-nome">{p.nome}</span>
                      <span className="cli-row-sub">{par===0?"recorrente":`${par} ${par===1?"mês":"meses"}`}</span>
                    </div>
                    <div className="cli-row-actions">
                      <span className="badge b-g">{fmt(parseFloat(p.valor)||0)}/mês</span>
                      <button className="btn-rm" onClick={()=>setProds(prods.filter(x=>x.id!==p.id))}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
        }
        {catalogo.length===0 ? (
          <div style={{fontSize:11,color:"var(--warn)"}}>Cadastre produtos no menu <strong>Produtos 🛒</strong> para negociar aqui.</div>
        ) : (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div className="fl" style={{flex:1,minWidth:140}}><label className="flabel">Produto</label>
              <select className="fi" value={f.produtoId} onChange={e=>{
                const p = catalogo.find(x=>x.id===e.target.value);
                setF(x=>({...x, produtoId:e.target.value, valor: p ? p.valor : x.valor}));
              }}>
                <option value="">— selecione —</option>
                {catalogo.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
              </select></div>
            <div className="fl" style={{width:110}}><label className="flabel">Valor/mês</label>
              <input className="fi" type="number" value={f.valor} onChange={e=>setF(x=>({...x,valor:e.target.value}))}/></div>
            <div className="fl" style={{width:130}}><label className="flabel">Quanto tempo</label>
              <select className="fi" value={f.parcelas} onChange={e=>setF(x=>({...x,parcelas:parseInt(e.target.value)}))}>
                {[1,2,3,4,5,6,9,12].map(n=><option key={n} value={n}>{n} {n===1?"mês":"meses"}</option>)}
                <option value={0}>Recorrente</option>
              </select></div>
            <button className="btn btn-p btn-sm" style={{marginBottom:1}} onClick={()=>{
              const p = catalogo.find(x=>x.id===f.produtoId);
              if(!p){alert("Selecione um produto.");return;}
              setProds([...prods, {id:"ln_"+Date.now(), produtoId:p.id, nome:p.nome, valor:parseFloat(f.valor)||0, parcelas:f.parcelas}]);
            }}>+ Add</button>
          </div>
        )}
        <div style={{fontSize:11,color:"var(--muted)"}}>
          Ao mover para <strong>Fechou</strong>, estes produtos entram como a receita mensal do cliente (início no mês de início acima). Sem produtos, vale o valor mensal do contrato. A geração de contrato continua usando o valor e a duração de "Informações básicas".
        </div>
      </div>
    );
  }

  // ── KANBAN ─────────────────────────────────────────────────
  const KANBAN_COLS = [
    {id:"em_contato",       label:"Em contato",              cor:"#1a5fa0"},
    {id:"follow_up",        label:"Follow-Up",               cor:"#8e44ad"},
    {id:"prod_contrato",    label:"Produção contrato",       cor:"#d67e20"},
    {id:"contrato_enviado", label:"Contrato enviado",        cor:"#8a5c00"},
    {id:"contrato_assinado",label:"Contrato assinado",       cor:"#2d6a2d"},
    {id:"fechou",           label:"Fechou",                  cor:"#1a4a1e"},
  ];

  const CAMPOS_CONTRATO = [
    {k:"razaoSocial",        label:"Razão social"},
    {k:"cnpj",               label:"CNPJ"},
    {k:"enderecoEmpresa",    label:"Endereço da empresa (com CEP)"},
    {k:"nomeResponsavel",    label:"Nome do responsável legal"},
    {k:"cpfResponsavel",     label:"CPF do responsável"},
    {k:"estadoCivil",        label:"Estado civil"},
    {k:"profissao",          label:"Profissão"},
    {k:"enderecoResponsavel",label:"Endereço do responsável"},
  ];

  function converterParaCliente(lead) {
    const targetAno = lead.anoInicio || 2026;
    const targetSet = targetAno === 2026 ? setData26 : setData27;
    const novoCliente = {
      id: "cli_" + Math.random().toString(36).slice(2) + Date.now().toString(36),
      nome: lead.nome || "Cliente",
      tipoReceita: lead.tipoReceita || "cliente",
      tipo: lead.tipo || "outro",
      valor: parseFloat(lead.valorContrato) || 0,
      inicio: parseInt(lead.mesInicio) || 0,
      parcelas: parseInt(lead.periodoContrato) || 0,
      status: "ativo",
      vencimento: "",
    };
    // Produtos negociados no Kanban viram os produtos contratados do cliente
    // (quando existem, definem a receita mensal em vez do valor único acima)
    const prods = (lead.produtosNegociados || []).map(p => ({
      id: "cp_" + Math.random().toString(36).slice(2),
      produtoId: p.produtoId || "",
      nome: p.nome,
      valor: parseFloat(p.valor) || 0,
      inicio: parseInt(lead.mesInicio) || 0,
      parcelas: parseInt(p.parcelas) || 0,
    }));
    if (prods.length) novoCliente.produtosContratados = prods;
    targetSet(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.clientes.push(novoCliente);
      saveData(next, targetAno);
      return next;
    });
  }

  function generateContract(lead) {
    const mesesNome = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2,"0");
    const mm = String(hoje.getMonth()+1).padStart(2,"0");
    const aaaa = hoje.getFullYear();
    const dataHoje = `${dd}/${mm}/${aaaa}`;
    const mesNomeHoje = mesesNome[hoje.getMonth()];

    const periodoN = parseInt(lead.periodoContrato) || 3;
    const valor = parseFloat(lead.valorContrato) || 0;
    const totalContrato = valor * periodoN;

    function fmtBRL(v) {
      return v.toLocaleString("pt-BR", {minimumFractionDigits:2,maximumFractionDigits:2});
    }
    function addMeses(baseAno, baseMes0, n) {
      // baseMes0 = 0-indexed month (0=Jan)
      const total = (baseAno * 12 + baseMes0) + n;
      return { ano: Math.floor(total/12), mes: (total%12)+1 };
    }

    // Primeira data de pagamento: usa o campo do lead se preenchido, senão hoje+1 mês
    let primeiroPagAno, primeiroPagMes0; // mes0 = 0-indexed
    if (lead.primeiroPagamento) {
      const [pAno, pMes] = lead.primeiroPagamento.split("-").map(Number);
      primeiroPagAno = pAno;
      primeiroPagMes0 = pMes - 1;
    } else {
      primeiroPagAno = hoje.getFullYear();
      primeiroPagMes0 = hoje.getMonth() + 1; // +1 = próximo mês (0-indexed)
    }

    // Dia de cada parcela: mesmo dia da 1ª data de pagamento
    const diaParcela = lead.primeiroPagamento
      ? lead.primeiroPagamento.split("-")[2]
      : "20";

    // Data fim = último mês de parcela
    const lastParcelaD = addMeses(primeiroPagAno, primeiroPagMes0, periodoN - 1);
    const dataFim = `${diaParcela}/${String(lastParcelaD.mes).padStart(2,"0")}/${lastParcelaD.ano}`;

    const parcelasHtml = Array.from({length: periodoN}, (_,i) => {
      const d = addMeses(primeiroPagAno, primeiroPagMes0, i);
      const ord = ["1ª","2ª","3ª","4ª","5ª","6ª","7ª","8ª","9ª","10ª","11ª","12ª"][i] || `${i+1}ª`;
      return `<p>${ord} Parcela: R$ ${fmtBRL(valor)} com vencimento em ${diaParcela}/${String(d.mes).padStart(2,"0")}/${d.ano}.</p>`;
    }).join("");

    const duracaoTexto = periodoN === 12 ? "1 (um) ano" : `${periodoN} (${["","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze"][periodoN]||periodoN}) meses`;
    const honorariosTexto = `o valor total de R$ ${fmtBRL(totalContrato)}, dividido em ${periodoN} (${
      ["","uma","duas","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze"][periodoN]||periodoN
    }) parcelas mensais de R$ ${fmtBRL(valor)}, pelo período de ${duracaoTexto}.`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato — ${lead.nome||"Cliente"}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:780px;margin:40px auto;padding:24px 32px;line-height:1.75;color:#1a1a18;font-size:14px}
  h1{font-size:15px;font-weight:bold;text-align:center;text-transform:uppercase;margin-bottom:24px;letter-spacing:.03em}
  h2{font-size:13px;font-weight:bold;text-transform:uppercase;margin-top:26px;margin-bottom:10px;border-bottom:1px solid #ddd;padding-bottom:4px}
  h3{font-size:14px;font-weight:bold;margin-top:18px;margin-bottom:6px}
  p{margin-bottom:8px;text-align:justify}
  .party-block{margin-bottom:16px}
  .sig-area{display:flex;justify-content:space-around;margin-top:70px;gap:20px}
  .sig-block{text-align:center;flex:1;max-width:280px}
  .sig-line{border-top:1.5px solid #333;margin-bottom:10px;margin-top:50px}
  @media print{body{margin:0;padding:24px}}
</style>
</head>
<body>
<h1>Contrato de Prestação de Serviços de Gestão de Canais de Vendas e CRM</h1>

<h2>Das Partes</h2>

<h3>Contratante</h3>
<div class="party-block">
  <p>${lead.razaoSocial}, pessoa jurídica de direito privado, inscrita no CNPJ nº ${lead.cnpj}, com sede na ${lead.enderecoEmpresa}, neste ato representada por:</p>
  <p>${lead.nomeResponsavel}, ${lead.profissao}, ${lead.estadoCivil}, inscrito(a) no CPF nº ${lead.cpfResponsavel}, residente e domiciliado(a) na ${lead.enderecoResponsavel}.</p>
</div>

<h3>Contratada</h3>
<div class="party-block">
  <p>KAIC MORALE, pessoa jurídica de direito privado, inscrita no CNPJ nº 58.282.395/0001-42, com sede na Rua Décio Piola, nº 4991, Parque Moema, CEP 14409-181, Franca/SP, neste ato representada por:</p>
  <p>Kaic Henrique Morales, inscrito no CPF nº 458.183.348-56, residente e domiciliado na Rua Décio Piola, nº 4991, Parque Moema, CEP 14409-181, Franca/SP.</p>
</div>

<p>As partes celebram o presente Contrato de Prestação de Serviços mediante as cláusulas e condições abaixo.</p>

<h2>Cláusula 1 – Do Objeto</h2>
<p>O presente contrato tem por objeto a prestação de serviços de gestão de canais de vendas, tráfego pago e CRM pela <strong>CONTRATADA</strong> em favor da <strong>CONTRATANTE</strong>.</p>

<h2>Cláusula 2 – Dos Entregáveis</h2>
<p>A <strong>CONTRATADA</strong> realizará os seguintes serviços:</p>
<p>I. Planejamento estratégico de campanhas;<br>
II. Configuração e organização das contas de anúncios;<br>
III. Gestão e otimização de campanhas;<br>
IV. Criação e segmentação de públicos;<br>
V. Monitoramento e análise de métricas;<br>
VI. Relatórios periódicos;<br>
VII. Reuniões estratégicas;<br>
VIII. Estruturação e organização do CRM;<br>
IX. Criação e acompanhamento de fluxos de relacionamento e recuperação de clientes;<br>
X. Segmentação de base de clientes;<br>
XI. Gestão de relacionamento com clientes;<br>
XII. Suporte via WhatsApp em horário comercial.</p>
<p><strong>Parágrafo Único:</strong> Serviços não previstos nesta cláusula serão considerados adicionais e dependerão de aprovação prévia entre as partes.</p>

<h2>Cláusula 3 – Das Responsabilidades da Contratada</h2>
<p>A <strong>CONTRATADA</strong> compromete-se a:</p>
<p>I. Executar os serviços contratados com ética, técnica e profissionalismo;<br>
II. Desenvolver estratégias compatíveis com os objetivos definidos pela <strong>CONTRATANTE</strong>;<br>
III. Apresentar relatórios e análises periódicas;<br>
IV. Manter sigilo sobre informações e dados recebidos;<br>
V. Comunicar situações que possam impactar a execução dos serviços;<br>
VI. Disponibilizar suporte via WhatsApp em horário comercial.</p>

<h2>Cláusula 4 – Das Limitações de Responsabilidade</h2>
<p>A <strong>CONTRATADA</strong> não será responsável por:</p>
<p>I. Garantia de faturamento, lucro ou resultados específicos;<br>
II. Bloqueios, suspensões ou restrições aplicadas por plataformas de terceiros;<br>
III. Alterações em políticas, algoritmos ou diretrizes das plataformas;<br>
IV. Falhas técnicas de sistemas ou serviços de terceiros;<br>
V. Informações incorretas fornecidas pela <strong>CONTRATANTE</strong>;<br>
VI. Atrasos decorrentes da ausência de materiais, aprovações ou acessos necessários;<br>
VII. Custos de ferramentas, plataformas, softwares ou serviços de terceiros;<br>
VIII. Produção de materiais gráficos, vídeos, fotos, websites ou conteúdos não previstos neste contrato.</p>

<h2>Cláusula 5 – Das Responsabilidades da Contratante</h2>
<p>A <strong>CONTRATANTE</strong> compromete-se a:</p>
<p>I. Disponibilizar os acessos necessários para execução dos serviços;<br>
II. Fornecer materiais, informações e documentos solicitados;<br>
III. Efetuar os pagamentos nas datas acordadas;<br>
IV. Manter formas de pagamento válidas nas plataformas utilizadas;<br>
V. Nomear um responsável para comunicação com a <strong>CONTRATADA</strong>;<br>
VI. Aprovar campanhas e estratégias dentro dos prazos necessários;<br>
VII. Arcar integralmente com os investimentos em mídia e demais custos operacionais das campanhas.</p>

<h2>Cláusula 6 – Da Vigência</h2>
<p>A vigência deste contrato terá início em ${dataHoje} e término em ${dataFim}. Ao final do período, as partes poderão renegociar condições, valores e escopo para eventual renovação mediante novo acordo formal.</p>
<p><strong>Parágrafo Primeiro:</strong> Por se tratar de contrato com prazo determinado, eventual desistência da <strong>CONTRATANTE</strong> antes do término da vigência não a eximirá da obrigação de pagamento dos valores contratados até o encerramento do período acordado.</p>
<p><strong>Parágrafo Segundo:</strong> Encerrado o prazo contratual, as partes poderão renegociar valores, escopo, condições comerciais e prazo para eventual renovação mediante novo acordo formal.</p>

<h2>Cláusula 7 – Dos Honorários e Condições de Pagamento</h2>
<p>Pelos serviços prestados, a <strong>CONTRATANTE</strong> pagará à <strong>CONTRATADA</strong> ${honorariosTexto}</p>
<h3>Cronograma de pagamento</h3>
${parcelasHtml}
<p><strong>Parágrafo Primeiro:</strong> Os pagamentos deverão ser realizados via PIX, transferência bancária ou outro meio acordado entre as partes.</p>
<p><strong>Parágrafo Segundo:</strong> Em caso de atraso superior a 7 (sete) dias corridos após o vencimento, a <strong>CONTRATADA</strong> poderá suspender imediatamente a prestação dos serviços até a regularização dos valores pendentes.</p>
<p><strong>Parágrafo Terceiro:</strong> Permanecendo a inadimplência por período superior a 30 (trinta) dias corridos, a <strong>CONTRATADA</strong> poderá considerar rescindido o contrato por culpa exclusiva da <strong>CONTRATANTE</strong>, permanecendo exigíveis todos os valores contratados até o término da vigência originalmente pactuada.</p>
<p><strong>Parágrafo Quarto:</strong> A <strong>CONTRATANTE</strong> autoriza expressamente que, após notificação formal e não havendo regularização da pendência no prazo de 10 (dez) dias corridos, seu débito possa ser encaminhado para cobrança extrajudicial, protesto em cartório e inscrição nos órgãos de proteção ao crédito, incluindo SPC Brasil e Serasa, nos termos da legislação vigente.</p>

<h2>Cláusula 8 – Das Taxas, Multas e Cobranças de Terceiros</h2>
<p>Toda e qualquer cobrança, multa, taxa, juros, estorno, bloqueio financeiro ou encargo realizado por plataformas de anúncios, administradoras de cartão, instituições financeiras ou meios de pagamento será de responsabilidade exclusiva da <strong>CONTRATANTE</strong>.</p>
<p>A <strong>CONTRATADA</strong> não possui controle sobre tais cobranças e não responderá por quaisquer prejuízos decorrentes delas.</p>

<h2>Cláusula 9 – Da Proteção de Dados</h2>
<p>As partes comprometem-se a cumprir integralmente a Lei Geral de Proteção de Dados – LGPD (Lei nº 13.709/2018).</p>
<p>A <strong>CONTRATADA</strong> compromete-se a:</p>
<p>I. Utilizar os dados recebidos exclusivamente para execução dos serviços contratados;<br>
II. Adotar medidas razoáveis de segurança para proteção das informações acessadas;<br>
III. Não compartilhar dados ou informações da <strong>CONTRATANTE</strong> com terceiros sem autorização prévia, exceto quando exigido por lei.</p>

<h2>Cláusula 10 – Das Disposições Gerais</h2>
<p>I. Não existe vínculo trabalhista, societário ou de exclusividade entre as partes.<br>
II. Todas as campanhas, estruturas, públicos, configurações e ativos desenvolvidos durante a vigência contratual permanecerão de propriedade da <strong>CONTRATANTE</strong> após o encerramento do contrato.<br>
III. A <strong>CONTRATADA</strong> poderá recusar a veiculação de conteúdos que violem leis, normas ou políticas das plataformas utilizadas.<br>
IV. A <strong>CONTRATANTE</strong> declara estar ciente de que não existe garantia de resultados financeiros específicos, uma vez que fatores externos podem impactar diretamente o desempenho das campanhas.<br>
V. O presente contrato somente poderá ser alterado mediante acordo formal entre as partes.<br>
VI. O não pagamento das parcelas contratadas não desobriga a <strong>CONTRATANTE</strong> do cumprimento integral das obrigações financeiras assumidas neste contrato, especialmente por se tratar de contrato com prazo determinado e reserva de agenda operacional da <strong>CONTRATADA</strong>.</p>

<h2>Cláusula 11 – Do Foro</h2>
<p>Fica eleito o Foro da Comarca de Franca/SP para dirimir quaisquer dúvidas ou controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>

<h2>Assinaturas</h2>
<p style="text-align:center">Franca-SP, ${dd} de ${mesNomeHoje} de ${aaaa}.</p>
<div class="sig-area">
  <div class="sig-block">
    <div class="sig-line"></div>
    <p>${lead.nomeResponsavel}<br>CPF nº ${lead.cpfResponsavel}</p>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <p>Kaic Henrique Morales<br>CPF nº 458.183.348-56</p>
  </div>
</div>
</body>
</html>`;

    const w = window.open("");
    if (w) { w.document.write(html); w.document.close(); }
  }

  function renderKanban() {
    const leads = dataKanban?.leads || [];

    // ── MODAL ABERTO ──
    if (kanbanModalId) {
      const lead = leads.find(l => l.id === kanbanModalId);
      if (!lead) { setKanbanModalId(null); return null; }

      const form = kanbanEditForm || lead;
      const colIdx = KANBAN_COLS.findIndex(c => c.id === form.coluna);
      const camposFaltando = CAMPOS_CONTRATO.filter(c => !form[c.k]?.toString().trim());
      const contratoOk = camposFaltando.length === 0;

      function salvarLead() {
        updateKanban(d => {
          const idx = d.leads.findIndex(l => l.id === kanbanModalId);
          if (idx >= 0) d.leads[idx] = { ...d.leads[idx], ...form };
          return d;
        });
        setKanbanEditForm(null);
        showToast("Lead salvo!");
      }

      function moverColuna(direcao) {
        const novoIdx = colIdx + direcao;
        if (novoIdx < 0 || novoIdx >= KANBAN_COLS.length) return;
        const novaColuna = KANBAN_COLS[novoIdx].id;
        const formAtualizado = { ...form, coluna: novaColuna };
        if (novaColuna === "fechou") {
          if (!confirm(`Mover "${form.nome}" para Fechou e adicionar como cliente ativo?`)) return;
          converterParaCliente(formAtualizado);
          showToast(`${form.nome} adicionado como cliente ativo!`);
        }
        setKanbanEditForm(formAtualizado);
        updateKanban(d => {
          const idx = d.leads.findIndex(l => l.id === kanbanModalId);
          if (idx >= 0) d.leads[idx] = { ...d.leads[idx], ...formAtualizado };
          return d;
        });
      }

      function adicionarComentario() {
        if (!kanbanCommentText.trim()) return;
        const novoComentario = { texto: kanbanCommentText.trim(), data: new Date().toISOString() };
        const comentariosAtualizados = [...(form.comentarios || []), novoComentario];
        const formAtualizado = { ...form, comentarios: comentariosAtualizados };
        setKanbanEditForm(formAtualizado);
        updateKanban(d => {
          const idx = d.leads.findIndex(l => l.id === kanbanModalId);
          if (idx >= 0) d.leads[idx] = { ...d.leads[idx], comentarios: comentariosAtualizados };
          return d;
        });
        setKanbanCommentText("");
      }

      function excluirLead() {
        if (!confirm(`Excluir o lead "${form.nome}"?`)) return;
        updateKanban(d => { d.leads = d.leads.filter(l => l.id !== kanbanModalId); return d; });
        setKanbanModalId(null);
        setKanbanEditForm(null);
      }

      function maskCPF(v) {
        return v.replace(/\D/g,"").slice(0,11)
          .replace(/(\d{3})(\d)/,"$1.$2")
          .replace(/(\d{3})(\d)/,"$1.$2")
          .replace(/(\d{3})(\d{1,2})$/,"$1-$2");
      }
      function maskCNPJ(v) {
        return v.replace(/\D/g,"").slice(0,14)
          .replace(/(\d{2})(\d)/,"$1.$2")
          .replace(/(\d{3})(\d)/,"$1.$2")
          .replace(/(\d{3})(\d)/,"$1/$2")
          .replace(/(\d{4})(\d{1,2})$/,"$1-$2");
      }

      const fi = (k, label, type="text", placeholder="") => (
        <div className="fl">
          <label className="flabel">{label}</label>
          <input className="fi" type={type} placeholder={placeholder}
            value={form[k]||""}
            onChange={e=>setKanbanEditForm(p=>({...(p||lead),[k]:e.target.value}))}/>
        </div>
      );
      const fimask = (k, label, maskFn, placeholder="") => (
        <div className="fl">
          <label className="flabel">{label}</label>
          <input className="fi" type="text" placeholder={placeholder}
            value={form[k]||""}
            onChange={e=>setKanbanEditForm(p=>({...(p||lead),[k]:maskFn(e.target.value)}))}/>
        </div>
      );
      const fsel = (k, label, opts) => (
        <div className="fl">
          <label className="flabel">{label}</label>
          <select className="fi" value={form[k]||opts[0].v}
            onChange={e=>setKanbanEditForm(p=>({...(p||lead),[k]:e.target.value}))}>
            {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
      );

      const colAtual = KANBAN_COLS[colIdx];
      const mesesOpcoes2026 = ANOS_CONFIG[2026].map((m,i)=>({v:i,l:`${m} 2026`}));
      const mesesOpcoes2027 = ANOS_CONFIG[2027].map((m,i)=>({v:i,l:`${m} 2027`}));
      const anoInicio = parseInt(form.anoInicio)||2026;
      const mesOptions = anoInicio===2026 ? mesesOpcoes2026 : mesesOpcoes2027;

      return (
        <div className="lead-modal-ov" onClick={e=>{if(e.target===e.currentTarget){setKanbanModalId(null);setKanbanEditForm(null);}}}>
          <div className="lead-modal">
            <div className="lead-modal-hdr">
              <div>
                <div className="lead-modal-title">{form.nome||"Lead sem nome"}</div>
                <div style={{marginTop:4}}>
                  <span className="col-badge" style={{background: colAtual?.cor+"22", color: colAtual?.cor, border:`1px solid ${colAtual?.cor}55`}}>
                    {colAtual?.label}
                  </span>
                </div>
              </div>
              <button className="btn-rm" style={{fontSize:22}} onClick={()=>{setKanbanModalId(null);setKanbanEditForm(null);}}>×</button>
            </div>

            <div className="lead-modal-body">
              {/* Informações básicas */}
              <div className="modal-section">
                <div className="modal-section-title">Informações básicas</div>
                <div className="fg">
                  {fi("nome","Nome","text","Ex: João Silva")}
                  {fi("telefone","Telefone","text","(17) 99999-9999")}
                  {fi("email","E-mail","email","joao@email.com")}
                  {fi("valorContrato","Valor mensal (R$)","number","1600")}
                  {fsel("periodoContrato","Duração do contrato",[
                    {v:"3", l:"3 meses"},
                    {v:"6", l:"6 meses"},
                    {v:"12",l:"1 ano (12 meses)"},
                  ])}
                  {fi("primeiroPagamento","1ª data de pagamento","date","")}
                  {fsel("tipoReceita","Tipo de receita",[
                    {v:"cliente",l:"Cliente"},
                    {v:"servico",l:"Serviço"},
                    {v:"comissao",l:"Comissão"},
                  ])}
                  {fsel("tipo","Subtipo",[
                    {v:"trafego",l:"Tráfego pago"},
                    {v:"assessor",l:"Assessor — consórcio"},
                    {v:"ecossistema",l:"Ecossistema completo"},
                    {v:"consorcio",l:"Consórcio próprio"},
                    {v:"outro",l:"Outro"},
                  ])}
                  {fsel("anoInicio","Ano de início",[{v:"2026",l:"2026"},{v:"2027",l:"2027"}])}
                  <div className="fl">
                    <label className="flabel">Mês de início</label>
                    <select className="fi" value={form.mesInicio??0}
                      onChange={e=>setKanbanEditForm(p=>({...(p||lead),mesInicio:parseInt(e.target.value)}))}>
                      {mesOptions.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Dados do contrato */}
              <div className="modal-section">
                <div className="modal-section-title">
                  Dados do contrato
                  {camposFaltando.length > 0
                    ? <span style={{marginLeft:8,fontSize:10,color:"var(--warn)",fontWeight:600,textTransform:"none"}}>({camposFaltando.length} campo(s) faltando)</span>
                    : <span style={{marginLeft:8,fontSize:10,color:"#1a6e1a",fontWeight:600,textTransform:"none"}}> ✓ completo</span>
                  }
                </div>
                <div className="fg">
                  {fi("razaoSocial","Razão social","text","Ex: Empresa LTDA")}
                  {fimask("cnpj","CNPJ",maskCNPJ,"00.000.000/0001-00")}
                  <div className="fl" style={{gridColumn:"1/-1"}}>
                    <label className="flabel">Endereço da empresa (com CEP)</label>
                    <input className="fi" placeholder="Rua, nº, Bairro, Cidade/UF, CEP" value={form.enderecoEmpresa||""}
                      onChange={e=>setKanbanEditForm(p=>({...(p||lead),enderecoEmpresa:e.target.value}))}/>
                  </div>
                  {fi("nomeResponsavel","Nome do responsável legal","text","Nome completo")}
                  {fimask("cpfResponsavel","CPF do responsável",maskCPF,"000.000.000-00")}
                  {fi("estadoCivil","Estado civil","text","Solteiro(a)")}
                  {fi("profissao","Profissão","text","Advogado(a)")}
                  <div className="fl" style={{gridColumn:"1/-1"}}>
                    <label className="flabel">Endereço do responsável</label>
                    <input className="fi" placeholder="Rua, nº, Bairro, Cidade/UF, CEP" value={form.enderecoResponsavel||""}
                      onChange={e=>setKanbanEditForm(p=>({...(p||lead),enderecoResponsavel:e.target.value}))}/>
                  </div>
                </div>
              </div>

              {/* Produtos negociados */}
              <LeadProdutos form={form} lead={lead}/>

              {/* Aviso de contrato - apenas na coluna "contrato_enviado" */}
              {form.coluna === "contrato_enviado" && (
                <div className="modal-section">
                  <div className="modal-section-title">Contrato</div>
                  {!contratoOk ? (
                    <div className="contract-warning">
                      <strong>Campos necessários para gerar o contrato:</strong>
                      <ul>{camposFaltando.map(c=><li key={c.k}>{c.label}</li>)}</ul>
                    </div>
                  ) : (
                    <button className="btn btn-p" style={{alignSelf:"flex-start"}} onClick={()=>generateContract(form)}>
                      Gerar Contrato
                    </button>
                  )}
                </div>
              )}

              {/* Comentários */}
              <div className="modal-section">
                <div className="modal-section-title">Registros / Comentários</div>
                {(form.comentarios||[]).length === 0
                  ? <div style={{fontSize:12,color:"var(--muted)",fontStyle:"italic"}}>Nenhum registro ainda.</div>
                  : <div className="comment-list">
                      {[...(form.comentarios||[])].reverse().map((c,i)=>(
                        <div className="comment-item" key={i}>
                          <div className="comment-date">{new Date(c.data).toLocaleString("pt-BR")}</div>
                          <CommentText text={c.texto}/>
                        </div>
                      ))}
                    </div>
                }
                <div style={{display:"flex",gap:8,marginTop:6}}>
                  <textarea className="fi" rows={2} placeholder="Escrever registro..."
                    style={{resize:"vertical",flex:1}}
                    value={kanbanCommentText}
                    onChange={e=>setKanbanCommentText(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&e.ctrlKey)adicionarComentario();}}/>
                  <button className="btn btn-p" style={{alignSelf:"flex-end",whiteSpace:"nowrap"}} onClick={adicionarComentario}>
                    Registrar
                  </button>
                </div>
              </div>
            </div>

            <div className="lead-modal-ftr">
              <button className="btn btn-sm" disabled={colIdx===0} onClick={()=>moverColuna(-1)}>← Voltar</button>
              <button className="btn btn-p btn-sm" disabled={colIdx===KANBAN_COLS.length-1} onClick={()=>moverColuna(1)}>
                {colIdx === KANBAN_COLS.length-2 ? "Fechar negócio →" : "Avançar →"}
              </button>
              <button className="btn btn-p btn-sm" style={{marginLeft:"auto"}} onClick={salvarLead}>Salvar</button>
              <button className="btn btn-sm" style={{color:"var(--red)",borderColor:"#e0b0b0"}} onClick={excluirLead}>Excluir</button>
            </div>
          </div>
        </div>
      );
    }

    // ── BOARD ──
    function novoLead() {
      const lead = {
        id: crypto.randomUUID(),
        coluna: "em_contato",
        nome:"", telefone:"", email:"", valorContrato:"", periodoContrato:"3", primeiroPagamento:"",
        tipoReceita:"cliente", tipo:"trafego",
        anoInicio: ano, mesInicio: 0,
        razaoSocial:"", cnpj:"", enderecoEmpresa:"",
        nomeResponsavel:"", cpfResponsavel:"", estadoCivil:"", profissao:"", enderecoResponsavel:"",
        comentarios: [],
        criadoEm: new Date().toISOString(),
      };
      updateKanban(d => { d.leads.push(lead); return d; });
      setKanbanEditForm(lead);
      setKanbanModalId(lead.id);
    }

    // ── DRAG & DROP HANDLERS ──
    const draggingLead = leads.find(l => l.id === draggingLeadId);
    const dragTargetBlocked = dragOverColId === "contrato_enviado" && draggingLead
      ? CAMPOS_CONTRATO.some(c => !draggingLead[c.k]?.toString().trim())
      : false;

    function handleDragStart(e, leadId) {
      setDraggingLeadId(leadId);
      e.dataTransfer.effectAllowed = "move";
    }

    function handleDragEnd() {
      setDraggingLeadId(null);
      setDragOverColId(null);
    }

    function handleDragOver(e, colId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverColId !== colId) setDragOverColId(colId);
    }

    function handleDragLeave(e) {
      if (!e.currentTarget.contains(e.relatedTarget)) setDragOverColId(null);
    }

    function handleDrop(e, colId) {
      e.preventDefault();
      setDragOverColId(null);
      if (!draggingLeadId) return;
      const lead = leads.find(l => l.id === draggingLeadId);
      if (!lead || lead.coluna === colId) { setDraggingLeadId(null); return; }

      if (colId === "contrato_enviado") {
        const faltando = CAMPOS_CONTRATO.filter(c => !lead[c.k]?.toString().trim());
        if (faltando.length > 0) {
          showToast("Preencha os dados do contrato antes de mover para esta etapa.");
          setKanbanEditForm(null);
          setKanbanModalId(lead.id);
          setDraggingLeadId(null);
          return;
        }
      }

      if (colId === "fechou") {
        if (!confirm(`Mover "${lead.nome}" para Fechou e adicionar como cliente ativo?`)) {
          setDraggingLeadId(null);
          return;
        }
        converterParaCliente({ ...lead, coluna: "fechou" });
        showToast(`${lead.nome} adicionado como cliente ativo!`);
      }

      updateKanban(d => {
        const idx = d.leads.findIndex(l => l.id === draggingLeadId);
        if (idx >= 0) d.leads[idx] = { ...d.leads[idx], coluna: colId };
        return d;
      });
      setDraggingLeadId(null);
    }

    return (
      <>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div>
            <div className="pg-title">Pipeline de Prospecção</div>
            <div style={{fontSize:13,color:"var(--muted)"}}>
              {leads.length} lead{leads.length!==1?"s":""} no pipeline
            </div>
          </div>
          <button className="btn btn-p btn-sm" onClick={novoLead}>+ Novo Lead</button>
        </div>

        <div className="kanban-board">
          {KANBAN_COLS.map(col => {
            const colLeads = leads.filter(l => l.coluna === col.id);
            const isOver = dragOverColId === col.id;
            const isBlocked = isOver && dragTargetBlocked;
            return (
              <div key={col.id}
                className={`kanban-col${isBlocked?" drag-blocked":isOver?" drag-over":""}`}
                onDragOver={e=>handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={e=>handleDrop(e, col.id)}
              >
                <div className="kanban-col-hdr">
                  <span className="kanban-col-title" style={{color:col.cor}}>{col.label}</span>
                  <span className="kanban-col-count">{colLeads.length}</span>
                </div>
                <div className="kanban-col-body">
                  {colLeads.map(lead => (
                    <div key={lead.id}
                      className={`kanban-card${draggingLeadId===lead.id?" dragging":""}`}
                      draggable
                      onDragStart={e=>handleDragStart(e, lead.id)}
                      onDragEnd={handleDragEnd}
                      onClick={()=>{if(!draggingLeadId){setKanbanEditForm(null);setKanbanModalId(lead.id);}}}
                    >
                      <div className="kanban-card-name" title={lead.nome||"—"}>{lead.nome||"Sem nome"}</div>
                      {lead.valorContrato && (
                        <div className="kanban-card-val">{fmt(parseFloat(lead.valorContrato)||0)}/mês</div>
                      )}
                      <div className="kanban-card-meta">
                        {lead.telefone||lead.email||""}
                      </div>
                      {(lead.comentarios||[]).length > 0 && (
                        <div style={{fontSize:10,color:"var(--muted)",marginTop:4}}>
                          {lead.comentarios.length} registro{lead.comentarios.length!==1?"s":""}
                        </div>
                      )}
                    </div>
                  ))}
                  {colLeads.length === 0 && (
                    <div style={{fontSize:11,color:"var(--muted2)",fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>Vazio</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{S}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="brand">
          Fluxo de Caixa
          <span className={`saving-dot ${saving==="saving"?"saving":saving==="saved"?"saved":saving==="error"?"error":""}`} title={saving==="saving"?"Salvando...":saving==="saved"?"Salvo!":saving==="error"?"Erro ao salvar — veja o console":""}/>
          {saving==="error"&&<span className="save-err">Erro ao salvar</span>}
        </div>
        <div className="hdr-right">
          <div className="hdr-stats">
            <div className="hdr-stat">
              <span className="hdr-lbl">Caixa {ano===2026?"dez/26":"dez/27"}</span>
              <span className={`hdr-val ${cc(last.caixa)}`}>{fmt(last.caixa)}</span>
            </div>
            <div className="hdr-stat">
              <span className="hdr-lbl">Ponto baixo</span>
              <span className={`hdr-val ${cc(minR.caixa)}`}>{fmt(minR.caixa)}</span>
            </div>
          </div>
          <div className="yr-sw">
            <button className={`yr-btn${ano===2026?" on":""}`} onClick={()=>setAno(2026)}>2026</button>
            <button className={`yr-btn${ano===2027?" on":""}`} onClick={()=>setAno(2027)}>2027</button>
          </div>
          <button
            className="btn btn-p btn-sm"
            disabled={saving==="saving"}
            onClick={()=>saveData(D,ano)}
            style={{minWidth:80}}
          >
            {saving==="saving"?"Salvando...":saving==="saved"?"✓ Salvo":saving==="error"?"✗ Erro":"Salvar"}
          </button>
          <div className="user-chip">
            {user.user_metadata?.avatar_url
              ? <img className="avatar" src={user.user_metadata.avatar_url} alt=""/>
              : <div className="avatar-fallback">{(user.email||"U")[0].toUpperCase()}</div>}
            <button className="btn-ghost" onClick={()=>supabase.auth.signOut()} title="Sair">Sair</button>
          </div>
        </div>
      </div>

      {/* LAYOUT: MENU LATERAL + CONTEÚDO */}
      <div className="layout">
        <div className={`sidebar${menuOpen?"":" closed"}`}>
          <button className="sb-toggle" title={menuOpen?"Recolher menu":"Expandir menu"} onClick={()=>setMenuOpen(o=>!o)}>
            {menuOpen ? "◀ Recolher" : "▶"}
          </button>
          {tabs.map(t=>(
            <button key={t.id} className={`sb-item${activeTab===t.id?" on":""}`} title={t.label} onClick={()=>setActiveTab(t.id)}>
              <span className="sb-ico">{t.icon}</span>
              {menuOpen && <span className="sb-lbl">{t.label}</span>}
            </button>
          ))}
        </div>
        <div className="content">{renderTab()}</div>
      </div>

      {/* DRAWER PAINEL DE CLIENTES */}
      {renderPainelDrawer()}

      {/* MODAL DE PRODUTOS DO CLIENTE */}
      {prodCliId && <ClienteProdutosModal cliId={prodCliId} onClose={()=>setProdCliId(null)}/>}

      {/* TOAST */}
      {toast && <div className="toast show">{toast}</div>}

      {/* ASSISTENTE FINANCEIRO */}
      <Assistente data26={data26} data27={data27} ano={ano} fl={fl} supabase={supabase} />
    </>
  );
}
