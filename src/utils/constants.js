export const ANOS_CONFIG = {
  2026: ["Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
  2027: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
};

export const DEF_CATS = () => [
  { id:"cartao",   nome:"Cartão de crédito", cor:"#c0392b", contas:[] },
  { id:"contab",   nome:"Contabilidade",     cor:"#d67e20", contas:[] },
  { id:"imposto",  nome:"Impostos",          cor:"#8e44ad", contas:[] },
  { id:"salarios", nome:"Salários",          cor:"#1a5fa0", contas:[] },
  { id:"cursos",   nome:"Cursos",            cor:"#1a7a4a", contas:[] },
];

export const TIPOS_CLIENTE = {
  assessor: "Assessor — consórcio",
  trafego: "Tráfego pago",
  ecossistema: "Ecossistema completo",
  consorcio: "Consórcio (próprio)",
  outro: "Outro"
};

export const STATUS_CLIENTE = {
  ativo: "Ativo",
  proposta: "Proposta enviada",
  prospecto: "Prospecto"
};

export const BADGE_COLORS = {
  ativo: "bg-emerald-100 text-emerald-800 border-emerald-200",
  proposta: "bg-amber-100 text-amber-800 border-amber-200",
  prospecto: "bg-slate-100 text-slate-800 border-slate-200"
};
