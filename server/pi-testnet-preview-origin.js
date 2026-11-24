const accessAppUrl = "https://apppiconnectuvr9006.pinet.com/";
const previewAppId = "6a565f08c5dfa5639ed4868d";
const registeredOrigin = "https://one-connect-git-develop-musabkorchachs-projects.vercel.app";
const previewOriginPattern = /^https:\/\/demo-[a-z0-9]+\.vusercontent\.net$/;

export function createTestnetOriginCheck(fetchPage = fetch, now = Date.now) {
  let cachedOrigin = null;
  let expiresAt = 0;
  let lookup;

  async function readPreviewOrigin() {
    try {
      const response = await fetchPage(accessAppUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return null;
      const html = await response.text();
      const metadata = `"id":"${previewAppId}"`;
      if (!html.includes(metadata) && !html.includes(JSON.stringify(metadata).slice(1, -1))) return null;
      const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<!--[\s\S]*?-->/gi, "");
      const frames = [...markup.matchAll(/<iframe\b[^>]*>/gi)]
        .filter(([tag]) => /\stitle="PiNet"/i.test(tag));
      if (frames.length !== 1) return null;
      const src = /\ssrc="([^"]+)"/i.exec(frames[0][0])?.[1];
      const origin = src && new URL(src).origin;
      return previewOriginPattern.test(origin) ? origin : null;
    } catch {
      return null;
    }
  }

  return async function isOneConnectTestnetOrigin(origin) {
    if (origin === registeredOrigin) return true;
    if (!previewOriginPattern.test(origin)) return false;
    if (now() >= expiresAt) {
      lookup ??= readPreviewOrigin().then((preview) => {
        cachedOrigin = preview;
        expiresAt = now() + (preview ? 30_000 : 5_000);
        lookup = undefined;
      });
      await lookup;
    }
    return origin === cachedOrigin;
  };
}
