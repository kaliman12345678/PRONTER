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
Siempre debes responder llamando a la herramienta "guardar_bloques".
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

    const toolSchema = {
      name: 'guardar_bloques',
      description: 'Devuelve la lista estructurada de escenas o ideas generadas.',
      input_schema: {
        type: 'object',
        properties: {
          bloques: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tipo: { type: 'string', enum: ['gancho', 'historia', 'moraleja', 'cta'] },
                titulo: { type: 'string' },
                inicio_s: { type: 'number' },
                fin_s: { type: 'number' },
                dialogo: { type: 'string' },
                texto_pantalla: { type: 'string' },
                plano: { type: 'string' },
                camara: { type: 'string' },
                indicaciones: { type: 'string' }
              },
              required: ['tipo', 'titulo', 'dialogo']
            }
          }
        },
        required: ['bloques']
      }
    };

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
          tools: [toolSchema],
          tool_choice: { type: 'tool', name: 'guardar_bloques' },
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

    let anthropicRes = await callAnthropic('claude-sonnet-5-5');

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
    const contentBlocks = (data?.content || []) as Array<{
      type: string;
      input?: { bloques?: unknown[] };
      text?: string;
    }>;

    const toolUse = contentBlocks.find((c) => c.type === 'tool_use');
    if (toolUse?.input?.bloques && Array.isArray(toolUse.input.bloques)) {
      return new Response(JSON.stringify({ bloques: toolUse.input.bloques }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const textBlock = contentBlocks.find((c) => c.type === 'text')?.text || '';
    const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed?.bloques)) {
        return new Response(JSON.stringify({ bloques: parsed.bloques }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(
      JSON.stringify({ error: 'La IA no devolvió bloques estructurados.' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
