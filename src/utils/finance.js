import { ANOS_CONFIG, DEF_CATS } from "./constants";

export function defAno(ano) {
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

export function fmt(v) {
  const n = Math.round(v);
  return (n < 0 ? "-" : "") + "R$" + Math.abs(n).toLocaleString("pt-BR");
}

export function cc(v) { 
  return v > 50 ? "pos" : v < 0 ? "neg" : "neu"; 
}

export function gastosEmpMes(d, ano) {
  const ms = ANOS_CONFIG[ano];
  return ms.map((_, i) => {
    const soma = d.categorias.reduce((acc, cat) =>
      acc + cat.contas.reduce((a, ct) => {
        const ini = parseInt(ct.inicio), par = parseInt(ct.parcelas), val = parseFloat(ct.valor) || 0;
        if (i < ini || (par !== 0 && (i - ini) >= par)) return a;
        return a + val;
      }, 0), 0);
    const temContas = d.categorias.some(cat => cat.contas.length > 0);
    return temContas ? soma : (d.gastosEmpresa[i] || 0);
  });
}

export function cliMes(d, ano) {
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

export function calcFlow(d, ano, caixaOverride = null) {
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
