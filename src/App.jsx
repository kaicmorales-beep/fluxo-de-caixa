// ============================================================
// FLUXO DE CAIXA — React para Lovable + Supabase + Google Auth
// Cole este arquivo inteiro no editor do Lovable
// ============================================================
import { useState, useEffect, useCallback } from "react";
import Assistente from "./components/Assistente.jsx";
import { createClient } from "@supabase/supabase-js";

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

function gastosEmpMes(d, ano) {
  const ms = ANOS_CONFIG[ano];
  return ms.map((_, i) => {
    const soma = d.categorias.reduce((acc, cat) =>
      acc + cat.contas.reduce((a, ct) => {
        const ini = parseInt(ct.inicio), par = parseInt(ct.parcelas), val = parseFloat(ct.valor) || 0;
        if (i < ini || (par !== 0 && (i - ini) >= par)) return a;
        return a + val;
      }, 0), 0);
    return soma;
  });
}

function cliMes(d, ano) {
  const n = ANOS_CONFIG[ano].length;
  const a = Array(n).fill(0);
  d.clientes.forEach(c => {
    if (c.status !== "ativo") return;
    const ini = parseInt(c.inicio), par = parseInt(c.parcelas), val = parseFloat(c.valor) || 0;
    for (let i = ini; i < n; i++) {
      if (par === 0 || (i - ini) < par) a[i] += val;
    }
  });
  return a;
}

function calcFlow(d, ano, caixaOverride = null) {
  const ms = ANOS_CONFIG[ano];
  const ge = gastosEmpMes(d, ano);
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

  /* TABS */
  .tabs{background:var(--white);border-bottom:1px solid var(--border);padding:0 20px;display:flex;overflow-x:auto;-ms-overflow-style:none;scrollbar-width:none}
  .tabs::-webkit-scrollbar{display:none}
  .tab{padding:12px 15px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;transition:color .12s}
  .tab:hover{color:var(--text)}
  .tab.on{color:var(--green);border-bottom-color:var(--green);font-weight:600}

  /* CONTENT */
  .content{padding:20px;width:100%;box-sizing:border-box}

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
  .badge{font-size:11px;font-weight:500;padding:3px 8px;border-radius:20px;white-space:nowrap}
  .b-g{background:var(--green-bg);color:var(--green-dark)}
  .b-gray{background:var(--surface);color:var(--muted)}
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
    .tabs{padding:0 8px}
    .tab{padding:10px 10px;font-size:12px}
  }
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
    Promise.all([loadFromDB(uid, 2026), loadFromDB(uid, 2027)]).then(([d26, d27]) => {
      setData26(d26);
      setData27(d27);
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

  if (loadingAuth) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--muted)",fontFamily:"var(--sans)"}}>Carregando...</div>;
  if (!session) return <><style>{S}</style><LoginPage /></>;
  if (!D) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--muted)",fontFamily:"var(--sans)"}}>Carregando dados...</div>;

  const ms = ANOS_CONFIG[ano];
  const carry26 = data26 ? calcFlow(data26, 2026) : null;
  const carryover = ano === 2027 && carry26 ? carry26[carry26.length-1].caixa : null;
  const fl = calcFlow(D, ano, carryover);
  const last = fl[fl.length-1];
  const minR = fl.reduce((a,r) => r.caixa < a.caixa ? r : a);
  const cm = cliMes(D, ano);
  const ge = gastosEmpMes(D, ano);
  const user = session.user;

  // ── RENDER TABS ────────────────────────────────────────────
  const tabs = [
    {id:"fluxo",     label:"Fluxo"},
    {id:"empresa",   label:"Empresa"},
    {id:"add-conta", label:"+ Conta"},
    {id:"clientes",  label:"+ Receita"},
    {id:"ativos",    label:"Receitas"},
    {id:"cenarios",  label:"Cenários"},
    {id:"reserva",   label:"Reserva"},
  ];

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
            <th>Banda</th><th>Clientes</th>
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
        const ini=parseInt(ct.inicio),par=parseInt(ct.parcelas),val=parseFloat(ct.valor)||0;
        return a+ms.reduce((acc,_,mi)=>mi>=ini&&(par===0||(mi-ini)<par)?acc+val:acc,0);
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
            <span style={{fontSize:12,color:"var(--muted)"}}>{cat.contas.length} conta{cat.contas.length!==1?"s":""}</span>
            <button className="btn btn-p btn-sm" style={{marginLeft:"auto"}} onClick={()=>setActiveTab("add-conta")}>+ Adicionar conta</button>
          </div>

          {cat.contas.length===0 && (
            <div style={{color:"var(--muted)",fontSize:13,padding:"12px 0"}}>Nenhuma conta nessa categoria ainda.</div>
          )}

          <div className="cli-list">
            {cat.contas.map((ct,cti)=>{
              const ini=parseInt(ct.inicio),par=parseInt(ct.parcelas),val=parseFloat(ct.valor)||0;
              const isEditing = editingConta?.ci===empCard && editingConta?.cti===cti;

              if (isEditing) return (
                <EditContaForm key={cti} ci={empCard} cti={cti} conta={ct} onDone={()=>setEditingConta(null)}/>
              );

              return (
                <div className="cli-card" key={cti}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{ct.nome}</div>
                    <div style={{fontSize:12,color:"var(--muted)"}}>
                      {par===0?"Recorrente":par+"x"} · início {ms[ini]?ms[ini].substring(0,3):"?"}
                      {ct.vencimento?` · vence dia ${ct.vencimento}`:""}
                    </div>
                    <div className="par-row">
                      {ms.map((_,mi)=>{
                        const ativo=mi>=ini&&(par===0||(mi-ini)<par);
                        const fora=mi<ini||(par!==0&&(mi-ini)>=par);
                        return <div key={mi} className="par-dot" title={ms[mi]} style={{background:ativo?cat.cor:fora?"#e2e1db":"#f0a0a0"}}/>;
                      })}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginTop:2}}>
                    <span className="badge" style={{background:"#fdf0f0",color:"var(--red)",border:"1px solid #e0b0b0"}}>{fmt(val)}/mês</span>
                    {par>0&&<span className="badge b-gray">Total: {fmt(val*par)}</span>}
                    <button className="btn btn-sm" onClick={()=>setEditingConta({ci:empCard,cti})}>Editar</button>
                    <button className="btn-rm" onClick={()=>{if(confirm("Remover?"))update(d=>{d.categorias[empCard].contas.splice(cti,1);return d;});}}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
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

        {totalGeral>0&&<div style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--muted)",marginBottom:16}}>Total {ano}: <strong style={{color:"var(--red)"}}>{fmt(totalGeral)}</strong></div>}

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:16}}>
          {D.categorias.map((cat,ci)=>{
            const total=catTotal(cat);
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
                  {fmt(Math.round(total/ms.length))}<span style={{fontSize:10,fontWeight:400,color:"var(--muted)"}}>/mês</span>
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                  {cat.contas.length} conta{cat.contas.length!==1?"s":""}
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
          const nome=prompt("Nome da nova categoria:");
          if(!nome)return;
          const cores=["#c0392b","#d67e20","#8e44ad","#1a5fa0","#1a7a4a","#806020","#305090"];
          update(d=>{d.categorias.push({id:"cat_"+Date.now(),nome:nome.trim(),cor:cores[d.categorias.length%cores.length],contas:[]});return d;});
        }}>+ Nova categoria</button>
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
      return (
        <>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
            <button className="btn btn-sm" onClick={()=>{setAtvCard(null);setEditingIdx(null);}}>← Voltar</button>
            <div style={{fontWeight:600,fontSize:17,color:grupo.cor}}>{grupo.label}</div>
            <span style={{fontSize:12,color:"var(--muted)"}}>{items.length} item{items.length!==1?"s":""}</span>
          </div>

          {items.length===0 && (
            <div style={{color:"var(--muted)",fontSize:13,padding:"12px 0"}}>
              Nenhum item aqui ainda. Use "+ Receita" para adicionar.
            </div>
          )}

          <div className="cli-list">
            {items.map(c=>{
              const i=c._i, ini=parseInt(c.inicio), par=parseInt(c.parcelas), val=parseFloat(c.valor)||0;
              const totalR=ms.reduce((acc,_,mi)=>mi<ini||(par!==0&&(mi-ini)>=par)?acc:acc+val,0);

              if(editingIdx===i) return <EditItemForm key={i} idx={i} item={c} onDone={()=>setEditingIdx(null)}/>;

              return (
                <div className="cli-card" key={i}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{c.nome}</div>
                    <div style={{fontSize:12,color:"var(--muted)"}}>
                      {TIPOS[c.tipo]||c.tipo||"—"} · início {ms[ini]||"?"} · {par===0?"recorrente":par+" parcela(s)"}
                    </div>
                    <div className="par-row">
                      {ms.map((_,mi)=>{
                        const ativo=c.status==="ativo"&&mi>=ini&&(par===0||(mi-ini)<par);
                        const fora=mi<ini||(par!==0&&(mi-ini)>=par);
                        return <div key={mi} className="par-dot" title={ms[mi]} style={{background:ativo?grupo.cor:fora?"#e2e1db":"#a8cfa8"}}/>;
                      })}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginTop:2}}>
                    <span className={`badge ${SBADGE[c.status]||"b-gray"}`}>{SLBL[c.status]||c.status}</span>
                    <span className="badge b-g">{fmt(val)}/mês</span>
                    {par>0&&<span className="badge b-gray">Total: {fmt(totalR)}</span>}
                    <button className="btn btn-sm" onClick={()=>setEditingIdx(i)}>Editar</button>
                    <button className="btn-rm" onClick={()=>{if(confirm("Remover?"))update(d=>{d.clientes.splice(i,1);return d;});}}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          {items.some(c=>c.status==="ativo")&&(
            <>
              <hr className="dv"/>
              <div className="sec-label">Receita por mês</div>
              <div className="tbl-wrap" style={{maxWidth:280}}>
                <table><thead><tr><th style={{textAlign:"left"}}>Mês</th><th>Total</th></tr></thead>
                  <tbody>{ms.map((m,mi)=>{
                    const v=items.filter(c=>c.status==="ativo").reduce((a,c)=>{
                      const ini=parseInt(c.inicio),par=parseInt(c.parcelas),val=parseFloat(c.valor)||0;
                      return mi>=ini&&(par===0||(mi-ini)<par)?a+val:a;
                    },0);
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
        <div className="pg-title">Receitas</div>
        <div className="pg-sub">Clique em um grupo para ver e editar os itens.</div>
        {totalGeral>0&&<div style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--muted)",marginBottom:16}}>Total ativo: <strong style={{color:"#1a6e1a"}}>{fmt(totalGeral)}/mês</strong></div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
          {GRUPOS.map(g=>{
            const items=D.clientes.map((c,i)=>({...c,_i:i})).filter(c=>(c.tipoReceita||"cliente")===g.key);
            const ativos=items.filter(c=>c.status==="ativo");
            const totalMes=ativos.reduce((a,c)=>a+(parseFloat(c.valor)||0),0);
            return (
              <div key={g.key} onClick={()=>setAtvCard(g.key)} style={{
                background:g.bg, border:`1.5px solid ${g.brd}`, borderRadius:"var(--r)",
                padding:18, cursor:"pointer", transition:"box-shadow .15s",
              }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.1)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}
              >
                <div style={{fontWeight:600,fontSize:14,color:g.cor,marginBottom:8}}>{g.label}</div>
                <div style={{fontSize:22,fontWeight:700,fontFamily:"var(--mono)",color:g.cor}}>
                  {fmt(totalMes)}<span style={{fontSize:11,fontWeight:400,color:"var(--muted)"}}>/mês</span>
                </div>
                <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>
                  {ativos.length} ativo{ativos.length!==1?"s":""} · {items.length} total
                </div>
                <div style={{marginTop:12,fontSize:12,color:g.cor,fontWeight:500}}>Ver detalhes →</div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // ── CENÁRIOS ───────────────────────────────────────────────
  function renderCenarios() {
    function sim(extra, from) {
      let cx = carryover !== null ? carryover : D.caixaInicial;
      return ms.map((mes,i)=>{
        const g=(D.gastosPessoal[i]||0)+ge[i];
        const e=(D.banda[i]||0)+cm[i]+(i>=from?extra:0);
        cx+=e-g; return {mes,caixa:cx};
      });
    }
    const f = ano===2026?1:0;
    const cens=[
      {t:"Sem cliente novo",    s:"Cenário atual",  e:0,    f,bc:"#f0b0b0"},
      {t:"1 cliente (R$2.500)", s:"+R$2.500/mês",   e:2500, f,bc:"#e8d090"},
      {t:"2 clientes (R$5k)",   s:"+R$5.000/mês",   e:5000, f,bc:"#a8d4a8"},
      {t:"4 clientes (R$10k)",  s:"+R$10.000/mês",  e:10000,f,bc:"#6db86d"},
    ];
    const idxShow = [2,3,4,ms.length-1];
    return (
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
        {cens.map((c,ci)=>{
          const s=sim(c.e,c.f);
          return <div className="card" key={ci} style={{borderColor:c.bc}}>
            <div style={{fontWeight:600,fontSize:14,marginBottom:2}}>{c.t}</div>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>{c.s}</div>
            {idxShow.filter(idx=>idx<ms.length).map(idx=>{
              const v=s[idx].caixa;
              return <div key={idx} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:12}}>
                <span style={{color:"var(--muted)"}}>{ms[idx]}</span>
                <span style={{fontFamily:"var(--mono)",fontWeight:600,color:v<0?"var(--red)":v<2000?"var(--warn)":"#1a6e1a"}}>{fmt(v)}</span>
              </div>;
            })}
          </div>;
        })}
      </div>
    );
  }

  // ── RESERVA ────────────────────────────────────────────────
  function renderReserva() {
    const cx=last.caixa, m1=5000,m2=10000,mi=28500;
    const pct=(v,m)=>Math.min(100,Math.max(0,Math.round(Math.max(0,v)/m*100)));
    return (
      <>
        <div className="cards-row">
          {[{lbl:"Meta urgente",val:m1,sub:"mínimo de segurança",c:"var(--warn)"},{lbl:"Meta segura",val:m2,sub:"1,5 mês de conforto",c:"#1a6e1a"},{lbl:"Reserva ideal (3 meses)",val:mi,sub:`${fmt(Math.max(0,mi-cx))} faltam`,c:"var(--text)"}].map((m,i)=>(
            <div className="card" key={i}>
              <div className="stat-lbl">{m.lbl}</div>
              <div className="stat-val" style={{color:m.c}}>{fmt(m.val)}</div>
              <div className="stat-sub">{m.sub}</div>
              <div className="meta-bg"><div className="meta-fill" style={{width:pct(cx,m.val)+"%",background:m.c}}/></div>
              <div style={{fontSize:11,color:"var(--muted)"}}>{pct(cx,m.val)}% atingido</div>
            </div>
          ))}
        </div>
        <div className="card" style={{fontSize:13,color:"var(--muted)",lineHeight:1.7}}>
          <strong style={{color:"var(--text)"}}>Onde guardar:</strong> CDB com liquidez diária — Nubank, Inter ou C6. Rende mais que poupança e você saca no mesmo dia.
        </div>
      </>
    );
  }

  // ── RENDER ACTIVE TAB ──────────────────────────────────────
  function renderTab() {
    if (activeTab === "fluxo") return (
      <>
        {ano===2027&&carryover!==null&&<div className="carry-banner">Caixa inicial herdado de dezembro/2026: <strong style={{fontFamily:"var(--mono)",marginLeft:4}}>{fmt(carryover)}</strong></div>}
        <div className="sec-label" style={{marginTop:0}}>Mês a mês</div>
        {renderFluxo()}
      </>
    );
    if (activeTab === "empresa") return renderEmpresa();
    if (activeTab === "add-conta") return <AddContaForm />;
    if (activeTab === "clientes") return <AddClienteForm />;
    if (activeTab === "ativos") return renderAtivos();
    if (activeTab === "cenarios") return <><div className="pg-title">Simulação de cenários</div><div className="pg-sub">Impacto de novos clientes no caixa.</div>{renderCenarios()}</>;
    if (activeTab === "reserva") return <><div className="pg-title">Meta de reserva</div><div className="pg-sub">Progresso em direção à reserva de 3 meses.</div>{renderReserva()}</>;
  }

  // Inline form components to access outer state via closure
  function AddContaForm() {
    const [form, setForm] = useState({nome:"",catIdx:empCard??0,valor:"",inicio:0,parcelas:0,vencimento:""});
    return (
      <>
        <div className="pg-title">Adicionar conta</div>
        <div className="pg-sub">Defina nome, categoria, valor, mês de início e parcelas.</div>
        <div className="form-wrap">
          <div className="fg">
            <div className="fl"><label className="flabel">Nome</label><input className="fi" value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Nubank fatura"/></div>
            <div className="fl"><label className="flabel">Categoria</label>
              <select className="fi" value={form.catIdx} onChange={e=>setForm(p=>({...p,catIdx:parseInt(e.target.value)}))}>
                {D.categorias.map((c,i)=><option key={i} value={i}>{c.nome}</option>)}
              </select></div>
            <div className="fl"><label className="flabel">Valor (R$)</label><input className="fi" type="number" value={form.valor} onChange={e=>setForm(p=>({...p,valor:e.target.value}))} placeholder="500"/></div>
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
              update(d=>{d.categorias[form.catIdx].contas.push({nome:form.nome,valor:parseFloat(form.valor),inicio:form.inicio,parcelas:form.parcelas,vencimento:form.vencimento||"",status:"ativo"});return d;});
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
          <div className="fl"><label className="flabel">Mover para categoria</label>
            <select className="fi" value={form.catIdx} onChange={e=>setForm(p=>({...p,catIdx:parseInt(e.target.value)}))}>
              {D.categorias.map((c,i)=><option key={i} value={i}>{c.nome}</option>)}
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
            update(d=>{
              const ct={...d.categorias[ci].contas[cti],...form,valor:parseFloat(form.valor)};
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
              update(d=>{d.clientes.push({...form,valor:parseFloat(form.valor)});return d;});
              setAtvCard(form.tipoReceita);
              setActiveTab("ativos");
              showToast("Receita adicionada!");
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
          <button className="btn" onClick={onDone}>Cancelar</button>
        </div>
      </div>
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

      {/* TABS */}
      <div className="tabs">
        {tabs.map(t=>(
          <button key={t.id} className={`tab${activeTab===t.id?" on":""}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* CONTENT */}
      <div className="content">{renderTab()}</div>

      {/* TOAST */}
      {toast && <div className="toast show">{toast}</div>}

      {/* ASSISTENTE FINANCEIRO */}
      <Assistente data26={data26} data27={data27} ano={ano} fl={fl} supabase={supabase} />
    </>
  );
}
