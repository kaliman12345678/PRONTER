const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface GenerateRequest {
  titulo: string;
  textoBase?: string;
  pilar?: string;
  formato?: string;
  objetivo?: string;
  ganchoTipo?: string;
  duracionSegundos?: number;
  tono?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Falta configurar ANTHROPIC_API_KEY en Supabase Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = (await req.json()) as GenerateRequest;
    const titulo = (body.titulo || '').trim();
    if (!titulo) {
      return new Response(
        JSON.stringify({ error: 'Falta el título o tema del guion.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const duracion = body.duracionSegundos || 45;
    const systemPrompt = `Eres un guionista y estratega experto en videos cortos (Reels y TikTok) en español natural y directo.
Responde ÚNICAMENTE con un objeto JSON válido (sin texto antes ni después, sin bloques markdown).
Estructura exacta:
{
  "bloques": [
    {
      "tipo": "gancho" | "historia" | "moraleja" | "cta",
      "titulo": "Nombre corto",
      "inicio_s": 0,
      "fin_s": 4,
      "dialogo": "Texto exacto",
      "texto_pantalla": "Texto en pantalla",
      "plano": "Plano sugerido",
      "camara": "Movimiento",
      "indicaciones": "Indicación breve"
    }
  ]
}
Reglas:
- Si te piden un guion: ritmo hablado ~3 palabras por segundo (apunta a ~${duracion} segundos totales), gancho fuerte al inicio y CTA claro al final.
- Si te piden una lluvia de ideas: devuelve exactamente la cantidad de bloques pedida, donde cada bloque es una idea distinta.`;

    const userPrompt = [
      `Tema / Título: ${titulo}`,
      body.textoBase ? `Instrucciones / Contexto: ${body.textoBase}` : '',
      body.pilar ? `Pilar: ${body.pilar}` : '',
      body.formato ? `Formato: ${body.formato}` : '',
      body.objetivo ? `Objetivo: ${body.objetivo}` : '',
      body.ganchoTipo ? `Estilo de gancho: ${body.ganchoTipo}` : '',
      body.tono ? `Tono: ${body.tono}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    const callAnthropic = (modelId: string) =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

    let anthropicRes = await callAnthropic('claude-sonnet-4-6');

    if (anthropicRes.status === 404) {
      const modelsRes = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      });
      if (modelsRes.ok) {
        const modelsJson = await modelsRes.json();
        const list = (modelsJson?.data || []) as { id: string }[];
        const preferred =
          list.find((m) => m.id.includes('sonnet')) ||
          list.find((m) => m.id.includes('haiku')) ||
          list[0];
        if (preferred?.id) {
          anthropicRes = await callAnthropic(preferred.id);
        }
      }
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: `Error de Anthropic (${anthropicRes.status}): ${errText}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await anthropicRes.json();
    const rawText: string = (data?.content?.[0]?.text || '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed: { bloques?: unknown[] } | null = null;
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1)) as { bloques?: unknown[] };
      } catch {
        parsed = null;
      }
    }

    if (!parsed || !Array.isArray(parsed.bloques)) {
      const objMatches = rawText.match(/\{[^{}]*"dialogo"\s*:[^{}]*\}/g) || [];
      const recovered = objMatches
        .map((chunk) => {
          try {
            return JSON.parse(chunk);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      if (recovered.length > 0) {
        parsed = { bloques: recovered };
      }
    }

    if (!parsed || !Array.isArray(parsed.bloques) || parsed.bloques.length === 0) {
      return new Response(
        JSON.stringify({ error: 'La IA no devolvió bloques válidos.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ bloques: parsed.bloques }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
