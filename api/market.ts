export const config = { runtime: "edge" };

const ALLOWED_KEYS = new Set([
  "item.unique.id",
  "item.runeword.key",
  "item.is_runeword",
  "item.name",
  "item.quality.name",
  "is_ladder",
  "is_hardcore",
  "$limit",
  "$sort[price]",
  "$sort[bumped_at]",
]);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (k === "$limit" && Number(v) > 25) {
      out.set(k, "25");
      continue;
    }
    out.set(k, v);
  }
  const upstream = `https://api.projectdiablo2.com/market/listing?${out.toString()}`;
  const res = await fetch(upstream);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
