import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function fmt(v) {
  const n = Math.round(v);
  return (n < 0 ? "-" : "") + "R$" + Math.abs(n).toLocaleString("pt-BR");
}

export default function Assistente({ data26, data27, ano, fl }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  function buildContext() {
    const D = ano === 2026 ? data26 : data27;
    if (!D || !fl) return "";

    const meses = fl
      .map(
        (r) =>
          `${r.mes}: entradas ${fmt(r.entradas)}, gastos ${fmt(r.gastos)}, saldo ${fmt(r.saldo)}, caixa acumulado ${fmt(r.caixa)}`
      )
      .join("\n");

    const clientesAtivos = D.clientes
      .filter((c) => c.status === "ativo")
      .map(
        (c) =>
          `- ${c.nome}: ${fmt(parseFloat(c.valor))}/mês, ${c.parcelas === 0 ? "recorrente" : c.parcelas + " parcelas"}`
      )
      .join("\n") || "Nenhum cliente ativo";

    const outrosClientes = D.clientes
      .filter((c) => c.status !== "ativo")
      .map((c) => `- ${c.nome} (${c.status}): ${fmt(parseFloat(c.valor))}/mês`)
      .join("\n") || "Nenhum";

    const categorias = D.categorias
      .filter((cat) => cat.contas.length > 0)
      .map((cat) => {
        const contas = cat.contas
          .map((ct) => `  · ${ct.nome}: ${fmt(parseFloat(ct.valor))}/mês, início mês ${ct.inicio}, ${ct.parcelas === 0 ? "recorrente" : ct.parcelas + " parcelas"}`)
          .join("\n");
        return `${cat.nome}:\n${contas}`;
      })
      .join("\n") || "Nenhuma despesa cadastrada";

    const last = fl[fl.length - 1];
    const minR = fl.reduce((a, r) => (r.caixa < a.caixa ? r : a));
    const negativos = fl.filter((r) => r.caixa < 0).map((r) => r.mes).join(", ") || "nenhum";
    const abaixo2k = fl.filter((r) => r.caixa >= 0 && r.caixa < 2000).map((r) => r.mes).join(", ") || "nenhum";
    const pctReserva = Math.round((Math.max(0, last.caixa) / 28500) * 100);

    // Dados do outro ano para contexto
    const outroAno = ano === 2026 ? 2027 : 2026;
    const outroData = ano === 2026 ? data27 : data26;
    const resumoOutroAno = outroData
      ? `Dados de ${outroAno} também estão disponíveis (${outroData.clientes?.filter(c => c.status === "ativo").length || 0} clientes ativos).`
      : "";

    return `ANO ANALISADO: ${ano}
CAIXA INICIAL: ${fmt(D.caixaInicial || 0)}
CAIXA FINAL (${last.mes}/${ano}): ${fmt(last.caixa)}
PONTO MAIS BAIXO: ${fmt(minR.caixa)} em ${minR.mes}
MESES COM CAIXA NEGATIVO: ${negativos}
MESES COM CAIXA ABAIXO DE R$2.000: ${abaixo2k}

FLUXO MENSAL:
${meses}

CLIENTES ATIVOS:
${clientesAtivos}

PROSPECTOS / PROPOSTAS ENVIADAS:
${outrosClientes}

DESPESAS DA EMPRESA POR CATEGORIA:
${categorias}

META DE RESERVA:
- Meta urgente: R$5.000
- Meta segura: R$10.000
- Reserva ideal (3 meses): R$28.500
- Caixa atual: ${fmt(last.caixa)} (${pctReserva}% da meta ideal)

${resumoOutroAno}`;
  }

  async function send() {
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const context = buildContext();
      const { data, error } = await supabase.functions.invoke("assistente", {
        body: { messages: newMessages, context },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const reply =
        data?.content?.[0]?.text ||
        "Não consegui processar sua pergunta. Tente novamente.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err?.message || JSON.stringify(err) || "erro desconhecido";
      console.error("[assistente] erro:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Erro: ${msg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Assistente financeiro"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 200,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: open ? "#1e4a1e" : "#2d6a2d",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontSize: open ? 24 : 20,
          boxShadow: "0 4px 16px rgba(0,0,0,.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background .15s, transform .15s",
          transform: open ? "rotate(45deg)" : "none",
        }}
      >
        {open ? "×" : "💬"}
      </button>

      {/* Painel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 88,
            right: 24,
            zIndex: 200,
            width: 370,
            maxWidth: "calc(100vw - 32px)",
            height: 520,
            maxHeight: "calc(100vh - 120px)",
            background: "#fff",
            border: "1px solid #e2e1db",
            borderRadius: 14,
            boxShadow: "0 8px 40px rgba(0,0,0,.16)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "13px 16px",
              borderBottom: "1px solid #e2e1db",
              background: "#f0efeb",
              borderRadius: "14px 14px 0 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "#eaf4ea",
                  border: "1px solid #b0d4b0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                }}
              >
                💰
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a18" }}>
                  Assistente financeiro
                </div>
                <div style={{ fontSize: 11, color: "#888780" }}>
                  Analisando {ano} · {fl?.filter((r) => r.cl > 0 || r.ba > 0).length || 0} meses com dados
                </div>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                style={{
                  background: "none",
                  border: "none",
                  color: "#888780",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 5,
                }}
                title="Limpar conversa"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Mensagens */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  color: "#888780",
                  fontSize: 12,
                  textAlign: "center",
                  marginTop: 16,
                  lineHeight: 1.8,
                }}
              >
                Olá! Tenho acesso completo ao seu fluxo de caixa.
                <br />
                <br />
                <span style={{ color: "#2d6a2d", fontWeight: 600 }}>Exemplos de perguntas:</span>
                <br />
                "Quando meu caixa fica negativo?"
                <br />
                "Quantos clientes preciso fechar para equilibrar?"
                <br />
                "Quais meses me preocupam mais?"
                <br />
                "Como está minha reserva de emergência?"
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  background: m.role === "user" ? "#2d6a2d" : "#f0efeb",
                  color: m.role === "user" ? "#fff" : "#1a1a18",
                  borderRadius:
                    m.role === "user"
                      ? "12px 12px 3px 12px"
                      : "12px 12px 12px 3px",
                  padding: "9px 13px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            ))}

            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  background: "#f0efeb",
                  borderRadius: "12px 12px 12px 3px",
                  padding: "9px 13px",
                  fontSize: 13,
                  color: "#888780",
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <span style={{ animation: "pulse 1s infinite" }}>●</span>
                <span style={{ opacity: 0.6 }}>●</span>
                <span style={{ opacity: 0.3 }}>●</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid #e2e1db",
              display: "flex",
              gap: 8,
              background: "#fafaf8",
              borderRadius: "0 0 14px 14px",
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Pergunte sobre seu fluxo de caixa..."
              disabled={loading}
              style={{
                flex: 1,
                border: "1px solid #d0cfc8",
                borderRadius: 8,
                padding: "8px 11px",
                fontSize: 13,
                fontFamily: "'Inter', sans-serif",
                outline: "none",
                background: "#fff",
                color: "#1a1a18",
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: "#2d6a2d",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                fontSize: 16,
                fontWeight: 600,
                opacity: loading || !input.trim() ? 0.45 : 1,
                transition: "opacity .15s",
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
