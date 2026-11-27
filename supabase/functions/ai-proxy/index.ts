const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type VaultKeyName = 'gemini' | 'tavily' | 'claude';

interface VaultBlob {
  gemini?: string;
  tavily?: string;
  claude?: string;
  hints?: Partial<Record<VaultKeyName, string>>;
}

const GEMINI_FALLBACKS = [
  'gemini-4-hydrogen',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function getEnvOrThrow(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Falta variable de entorno en Supabase: ${name}`);
  return val;
}

async function deriveServerAesKey(): Promise<CryptoKey> {
  const secret = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt'
  ]);
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptSecret(plain: string): Promise<string> {
  const key = await deriveServerAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain)
  );
  return `enc_v1:${bytesToB64(iv)}:${bytesToB64(new Uint8Array(encrypted))}`;
}

async function decryptSecret(encoded: string): Promise<string> {
  if (!encoded.startsWith('enc_v1:')) return '';
  const parts = encoded.split(':');
  if (parts.length !== 3) return '';
  const key = await deriveServerAesKey();
  const iv = b64ToBytes(parts[1]);
  const cipher = b64ToBytes(parts[2]);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}

async function readVault(spaceKey: string): Promise<VaultBlob> {
  const url = getEnvOrThrow('SUPABASE_URL');
  const serviceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(
    `${url}/rest/v1/guion_sync?space_key=eq.${encodeURIComponent(
      spaceKey
    )}&entity_type=eq.ai_config&entity_id=eq.team-vault&select=data`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    }
  );
  if (!res.ok) return {};
  const rows = (await res.json()) as Array<{ data?: VaultBlob }>;
  return rows?.[0]?.data || {};
}

async function writeVault(spaceKey: string, vault: VaultBlob): Promise<void> {
  const url = getEnvOrThrow('SUPABASE_URL');
  const serviceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(
    `${url}/rest/v1/guion_sync?on_conflict=space_key,entity_type,entity_id`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        space_key: spaceKey,
        entity_type: 'ai_config',
        entity_id: 'team-vault',
        data: vault,
        updated_at: Date.now(),
        deleted: false
      })
    }
  );
  if (!res.ok) {
    throw new Error(`No se pudo guardar en bóveda cifrada (${res.status})`);
  }
}

async function resolveKey(spaceKey: string, name: VaultKeyName): Promise<string> {
  const vault = await readVault(spaceKey);
  const enc = vault[name];
  if (enc) {
    try {
      const dec = await decryptSecret(enc);
      if (dec) return dec;
    } catch {
      // fall through to env secret
    }
  }
  const envMap: Record<VaultKeyName, string> = {
    gemini: 'GEMINI_API_KEY',
    tavily: 'TAVILY_API_KEY',
    claude: 'ANTHROPIC_API_KEY'
  };
  return Deno.env.get(envMap[name]) || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || '');
    const spaceKey = String(body.spaceKey || 'noxa-principal').trim() || 'noxa-principal';

    if (action === 'status') {
      const vault = await readVault(spaceKey);
      const envGemini = Boolean(Deno.env.get('GEMINI_API_KEY'));
      const envTavily = Boolean(Deno.env.get('TAVILY_API_KEY'));
      const envClaude = Boolean(Deno.env.get('ANTHROPIC_API_KEY'));
      return jsonResponse({
        gemini: {
          configured: Boolean(vault.gemini || envGemini),
          hint: vault.hints?.gemini || (envGemini ? 'Secreto servidor' : '')
        },
        tavily: {
          configured: Boolean(vault.tavily || envTavily),
          hint: vault.hints?.tavily || (envTavily ? 'Secreto servidor' : '')
        },
        claude: {
          configured: Boolean(vault.claude || envClaude),
          hint: vault.hints?.claude || (envClaude ? 'Secreto servidor' : '')
        }
      });
    }

    if (action === 'save_key') {
      const keyName = body.keyName as VaultKeyName;
      const apiKey = String(body.apiKey || '').trim();
      if (!['gemini', 'tavily', 'claude'].includes(keyName) || !apiKey) {
        return jsonResponse({ error: 'Falta keyName o apiKey válida.' }, 400);
      }
      const vault = await readVault(spaceKey);
      const encrypted = await encryptSecret(apiKey);
      const hint = `••${apiKey.slice(-4)}`;
      const updated: VaultBlob = {
        ...vault,
        [keyName]: encrypted,
        hints: {
          ...(vault.hints || {}),
          [keyName]: hint
        }
      };
      await writeVault(spaceKey, updated);
      return jsonResponse({ ok: true, keyName, hint });
    }

    if (action === 'clear_key') {
      const keyName = body.keyName as VaultKeyName;
      if (!['gemini', 'tavily', 'claude'].includes(keyName)) {
        return jsonResponse({ error: 'keyName inválido.' }, 400);
      }
      const vault = await readVault(spaceKey);
      delete vault[keyName];
      if (vault.hints) delete vault.hints[keyName];
      await writeVault(spaceKey, vault);
      return jsonResponse({ ok: true, keyName });
    }

    if (action === 'call_gemini') {
      const apiKey = await resolveKey(spaceKey, 'gemini');
      if (!apiKey) {
        return jsonResponse(
          { error: 'No hay clave de Gemini cifrada en Supabase todavía.' },
          400
        );
      }
      const requestedModel = String(body.model || 'gemini-4-hydrogen');
      const useSearch = Boolean(body.useSearch);
      const jsonMode = Boolean(body.jsonMode);
      const systemPrompt = String(body.systemPrompt || '');
      const userPrompt = String(body.userPrompt || '');

      const candidates = [
        requestedModel,
        ...GEMINI_FALLBACKS.filter((m) => m !== requestedModel)
      ];

      let lastErr = 'Error al llamar Gemini';
      for (const m of candidates) {
        const payloadBody: Record<string, unknown> = {
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
        };
        if (systemPrompt.trim()) {
          payloadBody.systemInstruction = { parts: [{ text: systemPrompt.trim() }] };
        }
        if (useSearch) {
          payloadBody.tools = [{ google_search: {} }];
        }
        if (jsonMode) {
          payloadBody.generationConfig = {
            responseMimeType: 'application/json',
            temperature: 0.75
          };
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            m
          )}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify(payloadBody)
          }
        );

        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            groundingMetadata?: {
              groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
            };
          }>;
        };

        if (res.ok) {
          const candidate = data?.candidates?.[0];
          const text = (candidate?.content?.parts || [])
            .map((p) => p.text || '')
            .join('\n')
            .trim();
          const chunks = candidate?.groundingMetadata?.groundingChunks || [];
          const sources: Array<{ title: string; uri: string }> = [];
          const seen = new Set<string>();
          for (const ch of chunks) {
            const uri = ch.web?.uri;
            if (uri && !seen.has(uri)) {
              seen.add(uri);
              sources.push({ title: ch.web?.title || uri, uri });
            }
          }
          return jsonResponse({ text, sources, modelUsed: m });
        }

        lastErr = `Error de Gemini (${res.status} en ${m}): ${data?.error?.message || res.statusText}`;
        const retry = !useSearch && (res.status === 503 || res.status === 429 || res.status === 404);
        if (!retry) {
          return jsonResponse({ error: lastErr }, 502);
        }
      }
      return jsonResponse({ error: lastErr }, 502);
    }

    if (action === 'call_tavily') {
      const apiKey = await resolveKey(spaceKey, 'tavily');
      if (!apiKey) {
        return jsonResponse({ error: 'No hay clave de Tavily configurada.' }, 400);
      }
      const query = String(body.query || '').trim();
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          topic: 'news',
          days: 7,
          max_results: 6,
          include_answer: true
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonResponse({ error: data?.detail || `Error Tavily (${res.status})` }, 502);
      }
      return jsonResponse(data);
    }

    if (action === 'call_claude') {
      const apiKey = await resolveKey(spaceKey, 'claude');
      if (!apiKey) {
        return jsonResponse({ error: 'No hay clave de Claude configurada.' }, 400);
      }
      const model = String(body.model || 'claude-sonnet-4-6');
      const systemPrompt = String(body.systemPrompt || '');
      const userPrompt = String(body.userPrompt || '');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonResponse(
          { error: `Error Claude (${res.status}): ${data?.error?.message || res.statusText}` },
          502
        );
      }
      return jsonResponse({ text: data?.content?.[0]?.text || '' });
    }

    return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Error interno en ai-proxy' },
      500
    );
  }
});
