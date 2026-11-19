"""BetIQ's page and data on the home server, at https://betiq.<your domain> behind the home
dashboard's login. Standard library only.

- The page (index.html, manifest, icon) comes from PAGE_DIR, which the deploy script fills.
- /rest/v1/... answers the app's bet-log and prices-file requests from betiqdb, for the person
  named in the dashboard's signed login pass only.
The served page is told it is on the home server (window.BETIQ_SERVER), so it saves to here
instead of Supabase.
"""
import html
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import betiqdb
import cfaccess

PAGE_DIR = os.environ.get("PAGE_DIR", "/page")
FILES = {"/": "index.html", "/index.html": "index.html", "/manifest.webmanifest": "manifest.webmanifest",
         "/icon.png": "icon.png"}
TYPES = {"html": "text/html; charset=utf-8", "webmanifest": "application/manifest+json", "png": "image/png"}
DB = None


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
