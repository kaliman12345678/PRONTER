const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface TrendsRequest {
  topic?: string;
  geo?: string;
}

function decodeXml(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]) : '';
}

function parseRssItems(xml: string, limit: number) {
  const items: Array<{ title: string; link: string; pubDate: string; traffic: string }> = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const chunk of matches.slice(0, limit)) {
    const title = extractTag(chunk, 'title');
    const link = extractTag(chunk, 'link');
    const pubDate = extractTag(chunk, 'pubDate');
    const traffic = extractTag(chunk, 'ht:approx_traffic');
    if (title) {
      items.push({ title, link, pubDate, traffic });
    }
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as TrendsRequest;
    const geo = (body.geo || 'CO').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'CO';
    const rawTopic = (body.topic || '').trim();
    const newsQuery = rawTopic
      ? `${rawTopic} OR tendencias OR viral`
      : 'tendencias virales redes sociales marketing negocios';

    const trendsUrl = `https://trends.google.com/trending/rss?geo=${geo}`;
    const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      newsQuery
    )}&hl=es-419&gl=${geo}&ceid=${geo}:es-419`;

    const [trendsRes, newsRes] = await Promise.all([
      fetch(trendsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null),
      fetch(newsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null)
    ]);

    const trendsXml = trendsRes && trendsRes.ok ? await trendsRes.text() : '';
    const newsXml = newsRes && newsRes.ok ? await newsRes.text() : '';

    const trendingItems = parseRssItems(trendsXml, 10);
    const newsItems = parseRssItems(newsXml, 8);

    const sources: Array<{ title: string; uri: string }> = [];
    for (const n of newsItems) {
      if (n.link) {
        sources.push({ title: n.title, uri: n.link });
      }
    }

    return new Response(
      JSON.stringify({
        geo,
        trendingNow: trendingItems.map((t) =>
          t.traffic ? `${t.title} (${t.traffic})` : t.title
        ),
        nicheNews: newsItems.map((n) => ({
          title: n.title,
          link: n.link,
          pubDate: n.pubDate
        })),
        sources
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error leyendo tendencias' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
