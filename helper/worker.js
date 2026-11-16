// BetIQ Lite helper: a tiny Cloudflare Worker.
//  1. GET /fixtures  -> this week's free prices file from football-data.co.uk, passed on so the app can load it by itself.
//                       Kept for 3 hours, so the source site is asked at most 8 times a day however often the app opens.
//  1b. GET /results?div=E0 -> the latest results for one league from the same site (last 80 matches), so the app can settle
//                       bets without spending credits. Also kept for 3 hours.
//  2. Once a day (cron) -> if a new file has appeared in the last 24 hours and it contains value bets, send one phone
//                       notification through ntfy.sh. Needs the NTFY_TOPIC secret; without it the cron does nothing.
// It holds no betting account details and no API keys. Optional settings: NTFY_TOPIC (secret), BOOKS (comma list of the
// bookmaker codes you use, from B365,BFD,BV,BW,PP,SKB), APP_URL (where the notification should open).
const SOURCE = "https://www.football-data.co.uk/fixtures.csv";
const BOOKS = { B365: "Bet365", BFD: "Betfred", BV: "BetVictor", BW: "Bwin", PP: "Paddy Power", SKB: "Sky Bet" };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET", "cache-control": "public, max-age=600" };

const DIVS = ["E0", "E1", "E2", "E3", "EC", "SC0", "SC1", "SC2", "SC3", "D1", "D2", "I1", "I2", "SP1", "SP2", "F1", "F2", "N1", "B1", "P1", "T1", "G1"];
export function seasonCode(now) {       // the football season runs from August: Nov 2026 -> "2627", Mar 2027 -> "2627"
  const d = new Date(now), y = d.getUTCFullYear() % 100, start = d.getUTCMonth() >= 7 ? y : y - 1;
  return String(start).padStart(2, "0") + String((start + 1) % 100).padStart(2, "0");
}
async function getResults(div, ctx) {
  const season = seasonCode(Date.now()), key = new Request("https://betiq-helper.invalid/results-v1/" + season + "/" + div);
  const store = typeof caches !== "undefined" && caches.default ? caches.default : null;
  if (store) { const hit = await store.match(key); if (hit) return hit; }
  const r = await fetch("https://www.football-data.co.uk/mmz4281/" + season + "/" + div + ".csv", { headers: { "user-agent": "betiq-lite-helper (personal use)" } });
  if (!r.ok) return new Response("source unavailable", { status: 502 });
  const lines = (await r.text()).replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean), head = lines[0].split(",");
  const keep = ["Div", "Date", "Time", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"].map((n) => head.indexOf(n));
  if (keep[3] < 0 || keep[5] < 0) return new Response("unexpected format", { status: 502 });
  const slim = [lines[0]].concat(lines.slice(1).slice(-80)).map((l) => { const c = l.split(","); return keep.map((i) => (i < 0 ? "" : c[i] || "")).join(","); }).join("\n");
  const out = new Response(slim, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "public, max-age=10800" } });
  if (store) { const put = store.put(key, out.clone()); if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put; }
  return out;
}
async function getFile(ctx) {
  const key = new Request("https://betiq-helper.invalid/fixtures-v1");
  const store = typeof caches !== "undefined" && caches.default ? caches.default : null;
  if (store) { const hit = await store.match(key); if (hit) return hit; }
  const r = await fetch(SOURCE, { headers: { "user-agent": "betiq-lite-helper (personal use)" } });
  if (!r.ok) return new Response("source unavailable", { status: 502 });
  const text = await r.text();
  const out = new Response(text, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "public, max-age=10800", "x-source-modified": r.headers.get("last-modified") || "" } });
  if (store) { const put = store.put(key, out.clone()); if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put; }
  return out;
}

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); if (row.length > 1) rows.push(row); }
  return rows;
}
function demargin(q) {            // power method, same as the app
  let lo = 0.5, hi = 3, k = 1;
  for (let i = 0; i < 50; i++) { k = (lo + hi) / 2; if (q.reduce((t, x) => t + Math.pow(x, k), 0) > 1) lo = k; else hi = k; }
  return q.map((x) => Math.pow(x, k));
}
// Same rules as the app: fair price from a busy Betfair Exchange market (else the bookmaker average), best price among your
// bookmakers, value = 3% to 12% above fair, odds no higher than 4.0, at least 4 bookmakers compared.
export function findValue(text, bookList) {
  const rows = parseCsv(text); if (rows.length < 2) return [];
  const col = {}; rows[0].forEach((h, i) => (col[h.trim()] = i));
  const num = (r, n) => { const v = parseFloat(r[col[n]]); return isFinite(v) && v > 1 && v < 1000 ? v : 0; };
  const use = Object.keys(BOOKS).filter((b) => !bookList || bookList.includes(b));
  const out = [];
  for (const r of rows.slice(1)) {
    const h = (r[col.HomeTeam] || "").trim(), a = (r[col.AwayTeam] || "").trim(); if (!h || !a) continue;
    const all = Object.keys(BOOKS).map((b) => ({ b, p: [num(r, b + "H"), num(r, b + "D"), num(r, b + "A")] })).filter((x) => x.p.every(Boolean));
    if (all.length < 4) continue;
    const ex = [num(r, "BFEH"), num(r, "BFED"), num(r, "BFEA")];
    let fair, yard;
    if (ex.every(Boolean) && ex.reduce((t, x) => t + 1 / x, 0) <= 1.025) { fair = demargin(ex.map((x) => 1 / x)); yard = "exchange"; }
    else { const fs = all.map((x) => demargin(x.p.map((v) => 1 / v))); fair = [0, 1, 2].map((i) => fs.reduce((t, f) => t + f[i], 0) / fs.length); yard = "average"; }
    const mine = all.filter((x) => use.includes(x.b)); if (!mine.length) continue;
    ["H", "D", "A"].forEach((_, i) => {
      const best = mine.reduce((m, x) => (x.p[i] > m.p[i] ? x : m)), price = best.p[i], edge = fair[i] * price - 1;
      if (edge >= 0.03 && edge <= 0.12 && price <= 4)
        out.push({ match: h + " v " + a, pick: i === 0 ? h : i === 1 ? "Draw" : a, odds: price, book: BOOKS[best.b], chance: fair[i], edge, min: 1.03 / fair[i], yard, date: (r[col.Date] || "") + " " + (r[col.Time] || "") });
    });
  }
  return out.sort((x, y) => (y.yard === "exchange") - (x.yard === "exchange") || y.edge - x.edge);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/fixtures") { const r = await getFile(ctx); const h = new Headers(r.headers); Object.entries(CORS).forEach(([k, v]) => h.set(k, v)); return new Response(r.body, { status: r.status, headers: h }); }
    if (url.pathname === "/results") {
      const div = url.searchParams.get("div") || "";
      if (!DIVS.includes(div)) return new Response("unknown league", { status: 400, headers: CORS });
      const r = await getResults(div, ctx); const h = new Headers(r.headers); Object.entries(CORS).forEach(([k, v]) => h.set(k, v)); return new Response(r.body, { status: r.status, headers: h });
    }
    if (url.pathname === "/") return new Response("BetIQ Lite helper is running. The app reads /fixtures and /results (v2).", { headers: { "content-type": "text/plain", ...CORS } });
    return new Response("not found", { status: 404, headers: CORS });
  },
  async scheduled(event, env, ctx) {
    if (!env || !env.NTFY_TOPIC) return;
    const r = await fetch(SOURCE, { headers: { "user-agent": "betiq-lite-helper (personal use)" } }); if (!r.ok) return;
    const mod = Date.parse(r.headers.get("last-modified") || ""); if (!(Date.now() - mod < 24 * 3600 * 1000)) return;   // only when the file is new
    const bets = findValue(await r.text(), env.BOOKS ? env.BOOKS.split(",").map((x) => x.trim()) : null); if (!bets.length) return;
    const body = bets.slice(0, 3).map((b) => b.pick + " at " + b.odds.toFixed(2) + " with " + b.book + "\n" + b.match + ", " + b.date.trim() + "\nChance " + Math.round(b.chance * 100) + "%. Only bet at " + b.min.toFixed(2) + " or better.").join("\n\n") +
      "\n\nThese are snapshot prices. Open the app and check the live price first. Skipping is always fine.";
    await fetch("https://ntfy.sh/" + encodeURIComponent(env.NTFY_TOPIC), { method: "POST", body, headers: { Title: "BetIQ: " + bets.length + (bets.length === 1 ? " value bet" : " value bets") + " in the new prices file", Click: env.APP_URL || "https://belboapps.github.io/betiq-lite/" } });
  },
};
