import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();

    const systemPrompt = `Você é um assistente financeiro pessoal especializado em fluxo de caixa.
Responda sempre em português brasileiro de forma clara, direta e prática.
Quando identificar riscos, seja específico (mês, valor).
Quando sugerir ações, priorize as mais impactantes.
Mantenha respostas concisas — no máximo 3 parágrafos ou uma lista objetiva.
Não repita os dados brutos de volta ao usuário, interprete-os.

DADOS FINANCEIROS ATUAIS DO USUÁRIO:
${context}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || "Erro na API da OpenAI");
    }

    // Retorna no mesmo formato que o frontend espera
    const reply = data?.choices?.[0]?.message?.content ?? "Sem resposta.";
    return new Response(
      JSON.stringify({ content: [{ text: reply }] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
