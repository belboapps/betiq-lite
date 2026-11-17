#!/usr/bin/env python3
"""BetIQ Lite home-server agents. Reads the bet log from your Supabase project and, every
few minutes:

  - Backup: a dated copy of the whole bet log each night, kept 30 days.
  - Closing-price collector: saves the final fair price shortly before kick-off for every
    open bet, so the closing-price score no longer depends on the page being open.
    Needs ODDS_API_KEY. Match-result bets only; other markets are left to the page.
  - Spending guardian: a monthly summary of money staked and returned, and one warning when
    the month's stakes pass BETIQ_MONTHLY_LIMIT.
  - Morning message: how many bets kick off today and how many are waiting for a result.
  - Health checker: says when Supabase, the Odds API key, the page or the backup has stopped
    working, once, and again when it is fixed.

It reports only. It never places a bet. Phone messages carry counts, never amounts.
Everything is set through environment variables (see server/README.md); nothing is typed in.
"""
import datetime as dt
import json
import os
import shutil
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request

EVERY = 5 * 60                 # seconds between passes
CLOSE_WINDOW = 25 * 60000      # collect a closing price this long before kick-off (milliseconds)
CLOSE_AGAIN = 12 * 60000       # and again if the saved one is older than this
EX_LIQUID = 1.025              # an exchange market is trusted when its prices add up to within 2.5% of 100%
KEEP_DAYS = 30
BRIEF_AT = dt.time(7, 30)      # UK time
APP_URL = os.environ.get("BETIQ_APP_URL", "https://belboapps.github.io/betiq-lite/")
DATA = os.environ.get("BETIQ_DATA", "/data")
BACKUPS = os.environ.get("BETIQ_BACKUP_DIR", "/backups")


class Problem(Exception):
    """Something outside the agent is not working. `key` names it for the health checker."""
    def __init__(self, key, text):
        super().__init__(text)
        self.key, self.text = key, text


# ---------- small helpers ----------
def uk_now():
    from zoneinfo import ZoneInfo
    return dt.datetime.now(ZoneInfo("Europe/London")).replace(tzinfo=None)


def now_ms():
    return int(time.time() * 1000)


def http(method, url, headers=None, body=None, timeout=20):
    """Returns (status, headers, text). Network failures raise OSError."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8", "replace")


def load_state():
    try:
        with open(os.path.join(DATA, "state.json")) as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def save_state(state):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, "state.json")
    with open(path + ".tmp", "w") as f:
        json.dump(state, f)
    os.replace(path + ".tmp", path)


def notify(title, body):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        return False
    try:
        req = urllib.request.Request("https://ntfy.sh/" + urllib.parse.quote(topic), data=body.encode(),
                                     headers={"Title": title, "Click": APP_URL}, method="POST")
        urllib.request.urlopen(req, timeout=10).close()
        return True
    except Exception:
        return False


# ---------- Supabase ----------
def _sb(method, path, body=None, prefer=None):
    url, key = os.environ.get("SUPABASE_URL", "").strip(), os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise Problem("sb_missing", "The Supabase address or key is not set on the server.")
    parts = urllib.parse.urlsplit(url)
    url = f"{parts.scheme}://{parts.netloc}"        # a pasted address may carry /rest/v1 or a trailing slash
    if key.startswith("sb_publishable_"):
        raise Problem("sb_key_kind", "The server has Supabase's publishable key, which cannot read the bet log. "
                                     "It needs the secret key (it starts sb_secret_) in its .env file.")
    headers = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    try:
        status, _, text = http(method, url + path, headers, body)
    except OSError:
        raise Problem("sb_down", "Supabase cannot be reached.")
    if status in (401, 403):
        raise Problem("sb_key", "Supabase rejected the server's key.")
    if status >= 400:
        raise Problem("sb_error", "Supabase is returning an error. A free project is paused after a "
                                  "period without use: check it in the Supabase dashboard.")
    return json.loads(text) if text.strip() else None


def fetch_rows():
    return _sb("GET", "/rest/v1/bets?select=user_id,pid,practice,m,data&limit=10000") or []


def live_bets(rows, practice=None):
    """The bets themselves, without deleted ones. practice=False gives real-money bets only."""
    out = []
    for r in rows:
        d = r.get("data") or {}
        if d.get("deleted") or not d.get("pid"):
            continue
        if practice is None or bool(r.get("practice")) == practice:
            out.append(d)
    return out


# ---------- Backup ----------
def backup(rows, today):
    """Writes today's copy once. Returns True when a copy was written on this call."""
    dest = os.path.join(BACKUPS, today.isoformat() + ".json")
    if os.path.exists(dest):
        return False
    os.makedirs(BACKUPS, mode=0o700, exist_ok=True)
    with open(dest + ".tmp", "w") as f:
        json.dump(rows, f)
    with open(dest + ".tmp") as f:           # read it back before trusting it
        if len(json.load(f)) != len(rows):
            raise OSError("the copy does not match")
    os.chmod(dest + ".tmp", 0o600)
    os.replace(dest + ".tmp", dest)
    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    for name in os.listdir(BACKUPS):
        stem = name[:-5] if name.endswith(".json") else ""
        try:
            dt.date.fromisoformat(stem)
        except ValueError:
            continue
        if stem < cutoff:
            os.remove(os.path.join(BACKUPS, name))
    return True


# ---------- Closing prices ----------
def demargin(q):
    """The page's power method: raise each implied chance to the power that makes them add up to 1."""
    lo, hi, k = 0.5, 3.0, 1.0
    for _ in range(50):
        k = (lo + hi) / 2
        if sum(x ** k for x in q) > 1:
            lo = k
        else:
            hi = k
    return [x ** k for x in q]


def fair_h2h(event):
    """Fair chance of each outcome of a match-result market, the way the page works it out with
    Pinnacle switched off: a busy Betfair Exchange market if there is one, else the average
    across bookmakers. Returns {} when too few bookmakers price the match."""
    books = []
    for b in event.get("bookmakers") or []:
        m = next((m for m in b.get("markets") or [] if m.get("key") == "h2h"), None)
        outs = [(o.get("name"), o.get("price")) for o in (m or {}).get("outcomes") or []]
        if len(outs) >= 2 and all(isinstance(p, (int, float)) and p > 1 for _, p in outs):
            books.append((b.get("key"), outs))
    if len(books) < 2:
        return {}
    n_out = max(len(o) for _, o in books)
    per, ex = {}, {}
    for key, outs in books:
        fairs = demargin([1 / p for _, p in outs])
        if key == "betfair_ex_uk" and len(outs) == n_out and sum(1 / p for _, p in outs) <= EX_LIQUID:
            ex = {name: f for (name, _), f in zip(outs, fairs)}
        for (name, _), f in zip(outs, fairs):
            per.setdefault(name, []).append(f)
    need = max(2, -(-len(books) * 6 // 10))          # at least 60% of the bookmakers, rounded up
    out = {n: ex.get(n, sum(fs) / len(fs)) for n, fs in per.items() if len(fs) >= need}
    return out if len(out) >= 2 else {}


def due_for_closing(bets, now):
    """Open match-result bets close enough to kick-off to have their final price saved."""
    due = []
    for b in bets:
        if b.get("status") != "open" or b.get("mkt") or not b.get("evId") or not b.get("key"):
            continue
        left = (b.get("time") or 0) - now
        fresh = now - ((b.get("close") or {}).get("at") or 0) < CLOSE_AGAIN
        if 0 < left <= CLOSE_WINDOW and not fresh:
            due.append(b)
    return due


def fetch_odds(sport_key, event_ids):
    key = os.environ.get("ODDS_API_KEY", "")
    q = urllib.parse.urlencode(dict(apiKey=key, regions="uk", markets="h2h", oddsFormat="decimal",
                                    eventIds=",".join(sorted(event_ids))))
    try:
        status, headers, text = http("GET", f"https://api.the-odds-api.com/v4/sports/{sport_key}/odds/?{q}")
    except OSError:
        raise Problem("odds_down", "The Odds API cannot be reached.")
    if status == 401:
        left = {k.lower(): v for k, v in headers.items()}.get("x-requests-remaining")
        if "OUT_OF_USAGE_CREDITS" in text or (left or "").strip() in ("0", "0.0"):
            raise Problem("odds_credits", "The Odds API credits have run out, so closing prices are not being saved.")
        raise Problem("odds_key", "The Odds API rejected the server's key.")
    if status == 429:
        raise Problem("odds_credits", "The Odds API credits have run out, so closing prices are not being saved.")
    if status >= 400:
        raise Problem("odds_error", "The Odds API is returning an error.")
    return json.loads(text)


def collect_closings(rows, now):
    """Saves a closing price on every bet that is due. Returns how many were saved."""
    if not os.environ.get("ODDS_API_KEY"):
        return 0
    by_pid = {(r["pid"], bool(r["practice"])): r for r in rows}
    wanted = {}
    for r in rows:
        d = r.get("data") or {}
        if not d.get("deleted") and due_for_closing([d], now):
            wanted.setdefault(d["key"], []).append((r["pid"], bool(r["practice"])))
    saved = 0
    for sport_key, ids in wanted.items():
        events = {e.get("id"): e for e in fetch_odds(sport_key, {by_pid[i]["data"]["evId"] for i in ids})}
        for i in ids:
            row = by_pid[i]
            fair = fair_h2h(events.get(row["data"]["evId"]) or {}).get(row["data"].get("sel"))
            if not fair:
                continue
            # Read the bet again just before writing, so a change made on the phone in the last
            # few minutes is kept. (A change made on the phone but not yet synced can still be
            # overwritten by this one: the newest change wins, as it does between two phones.)
            q = urllib.parse.urlencode({"user_id": "eq." + row["user_id"], "pid": "eq." + row["pid"],
                                        "practice": "eq." + str(row["practice"]).lower(),
                                        "select": "user_id,pid,practice,m,data"})
            latest = (_sb("GET", "/rest/v1/bets?" + q) or [None])[0]
            if not latest or (latest["data"] or {}).get("status") != "open":
                continue
            data = dict(latest["data"], close=dict(f=fair, r=0, at=now), m=now)
            _sb("POST", "/rest/v1/bets?on_conflict=user_id,pid,practice",
                [dict(user_id=row["user_id"], pid=row["pid"], practice=row["practice"], m=now, data=data)],
                prefer="resolution=merge-duplicates,return=minimal")
            saved += 1
    return saved


# ---------- Spending guardian ----------
def month_summary(bets, year, month):
    """Real-money bets placed in one calendar month (UK time is close enough at month ends)."""
    staked = returned = 0.0
    n = settled = 0
    for b in bets:
        at = dt.datetime.fromtimestamp((b.get("at") or b.get("time") or 0) / 1000)
        if (at.year, at.month) != (year, month):
            continue
        n += 1
        stake = float(b.get("stake") or 0)
        staked += stake
        if b.get("status") != "open":
            settled += 1
            returned += stake + float(b.get("profit") or 0)
    return dict(month=f"{year}-{month:02d}", bets=n, settled=settled, staked=round(staked, 2),
                returned=round(returned, 2), net=round(returned - staked, 2) if settled == n else None)


def guardian(bets, today, state):
    """Writes last month's summary once a month and warns once when this month passes the limit.
    Returns the phone messages to send: no amounts in them."""
    out = []
    this = month_summary(bets, today.year, today.month)
    first = today.replace(day=1)
    prev = first - dt.timedelta(days=1)
    if state.get("summary_for") != prev.strftime("%Y-%m"):
        last = month_summary(bets, prev.year, prev.month)
        os.makedirs(DATA, exist_ok=True)
        with open(os.path.join(DATA, "spending.txt"), "a") as f:
            f.write(f"{last['month']}: {last['bets']} bets, £{last['staked']:.2f} staked, "
                    f"£{last['returned']:.2f} returned"
                    + (f", net £{last['net']:+.2f}" if last["net"] is not None else ", some still open") + "\n")
        state["summary_for"] = prev.strftime("%Y-%m")
        if last["bets"]:
            out.append(f"Last month's betting summary is ready: {last['bets']} bets.")
    try:
        limit = float(os.environ.get("BETIQ_MONTHLY_LIMIT") or 0)
    except ValueError:
        limit = 0
    if limit > 0 and this["staked"] > limit and state.get("limit_told") != this["month"]:
        state["limit_told"] = this["month"]
        out.append("You have staked more this month than the betting limit you set.")
    return out


# ---------- Morning message ----------
def briefing(bets, now, state):
    today = now.date().isoformat()
    if now.time() < BRIEF_AT or state.get("brief") == today:
        return None
    state["brief"] = today
    ms = now_ms()
    start = dt.datetime.combine(now.date(), dt.time())
    off = (now - start).total_seconds() * 1000
    midnight = ms - off + 86400000
    opens = [b for b in bets if b.get("status") == "open"]
    kick = sum(1 for b in opens if ms <= (b.get("time") or 0) < midnight)
    waiting = sum(1 for b in opens if (b.get("time") or 0) < ms - 3 * 3600000)
    if not kick and not waiting:
        return None
    parts = []
    if kick:
        parts.append(f"{kick} bet{'s kick' if kick != 1 else ' kicks'} off today.")
    if waiting:
        parts.append(f"{waiting} {'are' if waiting != 1 else 'is'} waiting for a result.")
    return " ".join(parts)


# ---------- Health ----------
def announce(found, state):
    """found: {key: text}. A problem seen on two passes in a row is sent once; an all clear follows."""
    seen = set(state.get("seen", []))
    confirmed = {k: t for k, t in found.items() if k in seen}
    keys, told = sorted(confirmed), state.get("told", [])
    if keys != told:
        sent = (notify("BetIQ: something needs attention", " ".join(confirmed[k] for k in keys)) if keys
                else notify("BetIQ: all clear", "The earlier problem has gone."))
        if sent:
            told = keys
    state.update(seen=sorted(found), told=told, problems=[confirmed[k] for k in keys])
    return confirmed


def page_up():
    try:
        return http("GET", APP_URL, timeout=15)[0] == 200
    except OSError:
        return False


def one_pass(state, now=None):
    """Everything, once. Problems are collected rather than raised, so one failure does not stop the rest."""
    now = now or uk_now()
    found, rows = {}, None
    try:
        rows = fetch_rows()
    except Problem as p:
        found[p.key] = p.text
    if rows is not None:
        try:
            backup(rows, now.date())
            state["backup_ok"] = now.date().isoformat()
        except OSError:
            pass
        try:
            state["closings"] = state.get("closings", 0) + collect_closings(rows, now_ms())
        except Problem as p:
            found[p.key] = p.text
        real = live_bets(rows, practice=False)
        for msg in guardian(real, now.date(), state):
            notify("BetIQ", msg)
        msg = briefing(real, now, state)
        if msg:
            notify("BetIQ this morning", msg)
    last_ok = state.get("backup_ok")
    if last_ok and (now.date() - dt.date.fromisoformat(last_ok)).days > 2:
        found["backup"] = "The bet log backup has not worked for more than two days."
    if not page_up():
        found["page"] = "The BetIQ page is not loading."
    announce(found, state)
    state["checked"] = now.isoformat(timespec="seconds")
    return found


def main():
    print("BetIQ agents running. State in", DATA, "and backups in", BACKUPS, flush=True)
    while True:
        state = load_state()
        try:
            one_pass(state)
        except Exception:
            traceback.print_exc()
        save_state(state)
        time.sleep(EVERY)


if __name__ == "__main__":
    main()
