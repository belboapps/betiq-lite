"""BetIQ's page and data on the home server, at https://betiq.<your domain> behind the home
dashboard's login. Standard library only.

- The page (index.html, manifest, icon, and the design kit in belbo/) comes from PAGE_DIR, which the
  deploy script fills.
- /rest/v1/... answers the app's bet-log and prices-file requests from betiqdb, for the person
  named in the dashboard's signed login pass only.
- /results?div=E0 passes on the latest results for one league from football-data.co.uk (last 80
  matches, kept 3 hours), so the page settles football bets free. This does the job the Cloudflare
  helper's /results did, so the home-server copy needs no helper.
The served page is told it is on the home server (window.BETIQ_SERVER), so it saves to here
instead of Supabase.
"""
import html
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import betiqdb
import cfaccess

PAGE_DIR = os.environ.get("PAGE_DIR", "/page")
FILES = {"/": "index.html", "/index.html": "index.html", "/manifest.webmanifest": "manifest.webmanifest",
         "/icon.png": "icon.png",
         # The Belbo design kit (copied in by belbo-design's install.sh): its stylesheet and font.
         "/belbo/belbo.css": "belbo/belbo.css",
         "/belbo/fonts/PlusJakartaSans-Variable.woff2": "belbo/fonts/PlusJakartaSans-Variable.woff2",
         "/belbo/fonts/PlusJakartaSans-Variable-Italic.woff2": "belbo/fonts/PlusJakartaSans-Variable-Italic.woff2"}
TYPES = {"html": "text/html; charset=utf-8", "webmanifest": "application/manifest+json", "png": "image/png",
         "css": "text/css; charset=utf-8", "woff2": "font/woff2"}
DB = None

# Results: the same leagues and trimming as helper/worker.js.
DIVS = {"E0", "E1", "E2", "E3", "EC", "SC0", "SC1", "SC2", "SC3", "D1", "D2", "I1", "I2", "SP1", "SP2", "F1", "F2",
        "N1", "B1", "P1", "T1", "G1"}
RESULTS_KEEP = 3 * 3600          # football-data.co.uk is asked at most 8 times a day per league
RESULT_COLS = ["Div", "Date", "Time", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
_results, _results_lock = {}, threading.Lock()


def season_code(now=None):
    """The football season runs from August: Nov 2026 -> "2627", Mar 2027 -> "2627"."""
    d = time.gmtime(now if now is not None else time.time())
    y = d.tm_year % 100
    start = y if d.tm_mon >= 8 else y - 1
    return f"{start:02d}{(start + 1) % 100:02d}"


def slim_results(text):
    """Keep the header and the last 80 matches, with only the columns the page needs."""
    lines = [l for l in text.lstrip("\ufeff").splitlines() if l.strip()]
    if not lines:
        return None
    head = lines[0].split(",")
    keep = [head.index(n) if n in head else -1 for n in RESULT_COLS]
    if keep[3] < 0 or keep[5] < 0:
        return None
    out = []
    for line in [lines[0]] + lines[1:][-80:]:
        c = line.split(",")
        out.append(",".join("" if i < 0 or i >= len(c) else c[i] for i in keep))
    return "\n".join(out)


def fetch_results(div, now=None, get=None):
    """Results CSV for one league, from the 3-hour store or freshly fetched. None if unavailable."""
    now = now if now is not None else time.time()
    key = (season_code(now), div)
    with _results_lock:
        hit = _results.get(key)
        if hit and now - hit[0] < RESULTS_KEEP:
            return hit[1]
    url = f"https://www.football-data.co.uk/mmz4281/{key[0]}/{div}.csv"
    try:
        if get:
            text = get(url)
        else:
            req = urllib.request.Request(url, headers={"User-Agent": "betiq-lite-helper (personal use)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                text = r.read().decode("utf-8", "replace")
    except Exception:
        return hit[1] if hit else None
    body = slim_results(text)
    if body is None:
        return hit[1] if hit else None
    with _results_lock:
        _results[key] = (now, body)
    return body


def who(headers):
    team, auds = os.environ.get("CF_ACCESS_TEAM", "").strip(), os.environ.get("CF_ACCESS_AUD", "").strip()
    tok = headers.get("Cf-Access-Jwt-Assertion", "")
    if not (team and auds and tok):
        return None
    return cfaccess.verify(tok, team, {a.strip() for a in auds.split(",") if a.strip()})


def page():
    with open(os.path.join(PAGE_DIR, "index.html"), "rb") as f:
        body = f.read()
    extra = "<script>window.BETIQ_SERVER = true;</script>\n"
    dash = os.environ.get("DASHBOARD_URL", "").strip().rstrip("/")
    if dash.startswith("https://"):
        extra += f'<script src="{html.escape(dash)}/public/home.js" defer></script>\n'
    return body.replace(b"</head>", extra.encode() + b"</head>", 1)


class Handler(BaseHTTPRequestHandler):
    server_version = "betiq"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, data, ctype="application/json"):
        if not isinstance(data, bytes):
            data = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache" if ctype.startswith("text/html") else "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.end_headers()
        self.wfile.write(data)

    def _api(self, method):
        user = who(self.headers)
        if not user:
            return self._send(401, {"message": "Sign in through the home dashboard"})
        if method == "POST":
            site = self.headers.get("Sec-Fetch-Site")
            if site and site not in ("same-origin", "none"):
                return self._send(403, {"message": "Refused: sent from another website"})
            if not (self.headers.get("Content-Type") or "").startswith("application/json"):
                return self._send(415, {"message": "JSON only"})
            n = int(self.headers.get("Content-Length") or 0)
            if n > 20_000_000:
                return self._send(413, {"message": "Too big"})
            try:
                body = json.loads(self.rfile.read(n) or b"null")
            except ValueError:
                return self._send(400, {"message": "Not JSON"})
        else:
            body = None
        try:
            out = betiqdb.handle(DB, method, self.path, body, user=user)
        except betiqdb.BadRequest as e:
            return self._send(400, {"message": str(e)})
        if out is None:
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        return self._send(200, out)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/healthz":
            return self._send(200, {"ok": True})
        if path.startswith("/rest/v1/"):
            return self._api("GET")
        if path == "/results":
            if not who(self.headers):
                return self._send(401, {"message": "Sign in through the home dashboard"})
            q = urllib.parse.parse_qs(self.path.partition("?")[2])
            div = (q.get("div") or [""])[0]
            if div not in DIVS:
                return self._send(400, {"message": "Unknown league"})
            body = fetch_results(div)
            if body is None:
                return self._send(502, {"message": "Results source unavailable"})
            return self._send(200, body.encode(), "text/csv; charset=utf-8")
        if path in FILES:
            name = FILES[path]
            try:
                if name == "index.html":
                    data = page()
                else:
                    with open(os.path.join(PAGE_DIR, name), "rb") as f:
                        data = f.read()
            except FileNotFoundError:
                return self._send(404, {"message": "The page has not been copied to the server yet"})
            return self._send(200, data, TYPES[name.rsplit(".", 1)[1]])
        return self._send(404, {"message": "Not found"})

    def do_POST(self):
        if self.path.startswith("/rest/v1/"):
            return self._api("POST")
        return self._send(404, {"message": "Not found"})


def main():
    global DB
    DB = betiqdb.connect()
    port = int(os.environ.get("PORT", "8214"))
    srv = ThreadingHTTPServer((os.environ.get("BIND", "127.0.0.1"), port), Handler)
    print(f"BetIQ page and data on port {port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
