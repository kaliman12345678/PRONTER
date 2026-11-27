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
        JSON.stringify({
          error: 'Falta configurar el secreto ANTHROPIC_API_KEY en Supabase Edge Functions.'
        }),
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
    const systemPrompt = `Eres un guionista experto en videos cortos (Reels y TikTok) en español natural y directo.
Devuelve ÚNICAMENTE un JSON válido (sin markdown ni texto extra) con esta estructura exacta:
{
  "bloques": [
    {
      "tipo": "gancho" | "historia" | "moraleja" | "cta",
      "titulo": "Nombre corto de la escena (ej. Gancho, Escena 1, Cierre)",
      "inicio_s": 0,
      "fin_s": 4,
      "dialogo": "Texto exacto para leer en el teleprompter",
      "texto_pantalla": "Texto corto sugerido en pantalla",
      "plano": "Ej. Plano medio frontal",
      "camara": "Ej. Estática o acercamiento",
      "indicaciones": "Acción física o indicación breve de grabación"
    }
  ]
}
Reglas:
- Ritmo hablado ~3 palabras por segundo (apunta a ~${duracion} segundos totales).
- Empieza con un gancho fuerte en los primeros 3-4 segundos.
- Cierra con un CTA claro.`;

    const userPrompt = [
      `Tema / Título: ${titulo}`,
      body.textoBase ? `Idea base: ${body.textoBase}` : '',
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
          max_tokens: 1800,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

    let anthropicRes = await callAnthropic('claude-sonnet-5-5');

    // Auto-fallback to first active model from /v1/models if model ID changes
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
    const rawText: string = data?.content?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: 'La IA no devolvió un JSON válido.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
