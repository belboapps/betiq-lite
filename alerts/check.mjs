// BetIQ alerts: runs on a schedule in GitHub Actions, finds prices above the market average,
// and sends a phone notification through ntfy.sh. Same rules as the web page:
// margin removed per bookmaker, averaged across UK bookmakers, value = 3% to 12% above market,
// at least 4 bookmakers, odds no higher than 6.
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf8"));
const KEY = process.env.ODDS_API_KEY, TOPIC = process.env.NTFY_TOPIC;
const API = process.env.ODDS_API_BASE || "https://api.the-odds-api.com/v4";
const DRY = !!process.env.DRY_RUN;
if (!KEY) { console.error("Missing ODDS_API_KEY secret."); process.exit(1); }
if (!TOPIC && !DRY) { console.error("Missing NTFY_TOPIC secret."); process.exit(1); }

const EXCH = { betfair_ex_uk: 0.05, smarkets: 0.02, matchbook: 0.02 };
const VALUE_MIN = 0.03, VALUE_MAX = 0.12, LONGSHOT = 6;
const eff = (price, k) => (EXCH[k] ? 1 + (price - 1) * (1 - EXCH[k]) : price);
const allowed = (title) => !cfg.bookmakers || cfg.bookmakers.includes(title);

function analyse(ev) {
  const map = {}, order = []; let n = 0;
  for (const b of ev.bookmakers || []) {
    const m = (b.markets || []).find((x) => x.key === "h2h");
    const o = m && (m.outcomes || []).filter((x) => x.price > 1);
    if (!o || o.length < 2) continue;
    n++;
    const sum = o.reduce((p, x) => p + 1 / x.price, 0);
    for (const x of o) {
      if (!map[x.name]) { map[x.name] = { name: x.name, fair: [], prices: [] }; order.push(x.name); }
      map[x.name].fair.push(1 / x.price / sum);
      map[x.name].prices.push({ book: b.title, price: eff(x.price, b.key), ok: allowed(b.title) });
    }
  }
  if (n < 2) return null;
  const need = Math.max(2, Math.ceil(n * 0.6)), sels = [];
  for (const name of order) {
    const s = map[name]; if (s.fair.length < need) continue;
    const fair = s.fair.reduce((p, c) => p + c, 0) / s.fair.length;
    const best = s.prices.filter((x) => x.ok).sort((a, b) => b.price - a.price)[0];
    if (best) sels.push({ name, fair, best: best.price, book: best.book, edge: fair * best.price - 1 });
  }
  return { sels, n };
}

const found = [];
let remaining = null;
for (const league of cfg.leagues) {
  if (remaining !== null && remaining < cfg.keepCredits) { console.log("Credits low (" + remaining + "), stopping to keep some for the page."); break; }
  const url = new URL(API + "/sports/" + league + "/odds/");
  url.search = new URLSearchParams({ apiKey: KEY, regions: "uk", markets: "h2h", oddsFormat: "decimal" });
  const res = await fetch(url);
  const rem = res.headers.get("x-requests-remaining"); if (rem !== null && !isNaN(+rem)) remaining = +rem;
  if (!res.ok) { console.error(league + ": HTTP " + res.status); continue; }
  const now = Date.now();
  for (const ev of await res.json()) {
    const t = Date.parse(ev.commence_time);
    if (!(t > now + cfg.minHoursBeforeKickoff * 3600e3 && t < now + cfg.kickoffWithinHours * 3600e3)) continue;
    const a = analyse(ev); if (!a || a.n < 4) continue;
    for (const s of a.sels) {
      if (s.best <= LONGSHOT && s.edge >= VALUE_MIN && s.edge <= VALUE_MAX) found.push({ ev, league, t, ...s });
    }
  }
}
console.log("Credits remaining:", remaining, "· value bets found:", found.length);
if (!found.length) process.exit(0);

found.sort((a, b) => b.edge - a.edge);
const top = found.slice(0, cfg.maxBetsInAlert);
const when = (t) => new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(t);
const body = top.map((b) =>
  b.name + " @ " + b.best.toFixed(2) + " with " + b.book + "\n" + b.ev.home_team + " v " + b.ev.away_team + ", " + when(b.t) +
  "\nChance " + Math.round(b.fair * 100) + "%, " + (b.edge * 100).toFixed(1) + "% above market").join("\n\n");
const title = "BetIQ: " + found.length + (found.length === 1 ? " value bet" : " value bets");
const text = body + "\n\nPrices move fast. Check the price is still there. Open the page for your stake.";
if (DRY) { console.log(title + "\n" + text); process.exit(0); }
const r = await fetch("https://ntfy.sh/" + encodeURIComponent(TOPIC), {
  method: "POST", body: text, headers: { Title: title, Click: cfg.siteUrl, Tags: "chart_with_upwards_trend" },
});
if (!r.ok) { console.error("ntfy failed: HTTP " + r.status); process.exit(1); }
console.log("Notification sent.");
