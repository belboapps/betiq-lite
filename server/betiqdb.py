"""BetIQ's own data store on the home server, in place of Supabase.

It answers the handful of Supabase-style requests that the app and the agent already make
(the bets table, the files table and the user list), from a SQLite file in the agent's data
folder. Keeping the same requests means the app and the agent barely change.

Users are identified by email: the web server takes it from the home dashboard's signed login
pass, so one person can never read or change another's rows. The weekly prices file is shared
by everyone (user "*").
"""
import json
import os
import sqlite3
import threading
import urllib.parse

SHARED = "*"
_lock = threading.Lock()


def connect(path=None):
    path = path or os.environ.get("BETIQ_DB", "")
    if not path:
        raise sqlite3.OperationalError("BETIQ_DB is not set")
    c = sqlite3.connect(path, timeout=30, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=30000")
    c.executescript("""
CREATE TABLE IF NOT EXISTS bets(user_id TEXT NOT NULL, pid TEXT NOT NULL, practice INTEGER NOT NULL,
  m INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id, pid, practice));
CREATE TABLE IF NOT EXISTS files(user_id TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL,
  fetched_at TEXT NOT NULL, PRIMARY KEY(user_id, name));
""")
    return c


class BadRequest(Exception):
    pass


def _filters(query):
    """PostgREST-style ?col=eq.value filters, for the columns we know."""
    out = {}
    for k, vals in urllib.parse.parse_qs(query, keep_blank_values=True).items():
        if k in ("select", "limit", "on_conflict", "order"):
            continue
        v = vals[0]
        if not v.startswith("eq."):
            raise BadRequest(f"Only eq. filters are supported ({k})")
        out[k] = v[3:]
    return out


def _bool(v):
    if isinstance(v, bool):
        return v
    return str(v).lower() in ("true", "1", "t")


def handle(c, method, path, body=None, user=None):
    """Answer one request. `user` limits it to that person's rows (the web server always passes
    it; the agent, which looks after everyone, does not). Returns the JSON-ready result."""
    parts = urllib.parse.urlsplit(path)
    table, q = parts.path, parts.query
    f = _filters(q)
    if user is not None:
        f.pop("user_id", None)
    if table == "/auth/v1/admin/users":
        if user is not None:
            raise BadRequest("Not allowed")
        return {"users": [{"id": SHARED}]}
    if table == "/rest/v1/bets":
        if method == "GET":
            sql, args = "SELECT user_id, pid, practice, m, data FROM bets WHERE 1=1", []
            if user is not None:
                sql += " AND user_id=?"; args.append(user)
            for col in ("user_id", "pid"):
                if col in f:
                    sql += f" AND {col}=?"; args.append(f[col])
            if "practice" in f:
                sql += " AND practice=?"; args.append(int(_bool(f["practice"])))
            if set(f) - {"user_id", "pid", "practice"}:
                raise BadRequest("Unknown filter")
            return [dict(user_id=r["user_id"], pid=r["pid"], practice=bool(r["practice"]), m=r["m"],
                         data=json.loads(r["data"])) for r in c.execute(sql + " ORDER BY m", args)]
        if method == "POST":
            rows = body if isinstance(body, list) else [body]
            with _lock, c:
                for r in rows:
                    uid = user if user is not None else r.get("user_id")
                    pid, data = r.get("pid"), r.get("data")
                    if not uid or not isinstance(pid, str) or not pid or not isinstance(data, dict):
                        raise BadRequest("A bet row is missing its id or data")
                    c.execute("INSERT INTO bets(user_id, pid, practice, m, data) VALUES(?,?,?,?,?) "
                              "ON CONFLICT(user_id, pid, practice) DO UPDATE SET m=excluded.m, data=excluded.data",
                              (uid, pid[:100], int(_bool(r.get("practice"))), int(r.get("m") or 0), json.dumps(data)))
            return None
    if table == "/rest/v1/files":
        if method == "GET":
            who = [user, SHARED] if user is not None else ([f["user_id"]] if "user_id" in f else None)
            sql, args = "SELECT user_id, name, body, fetched_at FROM files WHERE 1=1", []
            if who:
                sql += " AND user_id IN (%s)" % ",".join("?" * len(who)); args += who
            if "name" in f:
                sql += " AND name=?"; args.append(f["name"])
            return [dict(r) for r in c.execute(sql + " ORDER BY fetched_at DESC", args)]
        if method == "POST":
            if user is not None:
                raise BadRequest("Not allowed")
            rows = body if isinstance(body, list) else [body]
            with _lock, c:
                for r in rows:
                    c.execute("INSERT INTO files(user_id, name, body, fetched_at) VALUES(?,?,?,?) "
                              "ON CONFLICT(user_id, name) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at",
                              (r["user_id"], r["name"], r["body"], r["fetched_at"]))
            return None
    raise BadRequest("Unknown request")


def import_rows(c, rows, user_of):
    """Copy Supabase bet rows in, with each Supabase user id swapped for an email. Keeps whichever
    copy of a bet is newer. Returns how many rows were taken."""
    n = 0
    with _lock, c:
        for r in rows:
            uid = user_of.get(r.get("user_id"))
            if not uid or not r.get("pid") or not isinstance(r.get("data"), dict):
                continue
            cur = c.execute("SELECT m FROM bets WHERE user_id=? AND pid=? AND practice=?",
                            (uid, r["pid"], int(_bool(r.get("practice"))))).fetchone()
            if cur and cur["m"] >= int(r.get("m") or 0):
                continue
            c.execute("INSERT OR REPLACE INTO bets(user_id, pid, practice, m, data) VALUES(?,?,?,?,?)",
                      (uid, r["pid"], int(_bool(r.get("practice"))), int(r.get("m") or 0), json.dumps(r["data"])))
            n += 1
    return n
