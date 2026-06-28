// Cloudflare Pages Function — proxies /catalog/:brandId to the Railway backend.
// This gives customers a clean gopiram-app.pages.dev URL instead of the API domain.
export async function onRequest({ request, params, env }) {
  const apiBase = env.EXPO_PUBLIC_API_URL || 'https://api.gopiramsarees.in';
  const url = new URL(request.url);
  const target = `${apiBase}/catalog/${params.brandId}${url.search}`;

  try {
    const resp = await fetch(target, {
      headers: { Accept: 'text/html', 'User-Agent': 'Gopiram-Pages-Proxy' },
    });
    const html = await resp.text();
    return new Response(html, {
      status: resp.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>Catalog temporarily unavailable</h2>
        <p>Please try again in a moment.</p>
      </body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
