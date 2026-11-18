"""Tipster tracker. Logs each tip when you forward it, settles it from real results, and rates
each tipster on return and on beating the final price.

How a tip gets in: post a line to a private ntfy topic (TIPS_TOPIC) from the ntfy app, as
    tipster; home team v away team; selection; odds
for example
    Sharp Sam; Arsenal v Everton; Arsenal; 2.10
The selection is one of the two teams or "draw". Football match results only, in the leagues
that football-data.co.uk covers. The time ntfy received the message is the time the tip was
captured, so it cannot be back-dated: a tip that arrives after kick-off is kept but never counted.

Results and final prices come from football-data.co.uk's free files (personal use; asked at
most a few times a day). The final fair price is the Betfair Exchange closing price when its
market was busy, otherwise the bookmaker average at the close, with the margin taken out.
Fewer than MIN_TIPS counted tips is flagged as too early to judge.
"""
import csv
import datetime as dt
import io
import json
import os
import unicodedata
import urllib.parse

SRC = "https://football-data.co.uk"
MIN_TIPS = 100
EX_LIQUID = 1.025
DROP = {"fc", "afc", "cf", "sc", "the", "and"}
# Everyday names for teams that football-data.co.uk spells its own way.
ALIAS = {"man utd": "man united", "manchester united": "man united", "manchester utd": "man united",
         "manchester city": "man city", "nottingham forest": "nottm forest", "forest": "nottm forest",
         "wolverhampton": "wolves", "wolverhampton wanderers": "wolves", "spurs": "tottenham",
         "sheff utd": "sheffield united", "sheff wed": "sheffield weds", "sheffield wednesday": "sheffield weds",
         "qpr": "qpr", "queens park rangers": "qpr", "west brom": "west brom", "west bromwich albion": "west brom"}


def norm(name):
    t = unicodedata.normalize("NFD", str(name).lower())
    t = "".join(c for c in t if not unicodedata.combining(c)).replace("&", " and ")
    t = "".join(c if c.isalnum() or c == " " else " " for c in t.replace("'", "").replace("\u2019", ""))
    t = " ".join(w for w in t.split() if w not in DROP)
    return ALIAS.get(t, t)


def same_team(a, b):
    x, y = norm(a), norm(b)
    return bool(x and y) and (x == y or x in y or y in x)


def parse_tip(text):
    """'tipster; home v away; selection; odds' -> dict, or None when it is not in that form."""
    parts = [p.strip() for p in str(text).split(";")]
    if len(parts) != 4 or not all(parts):
        return None
    low = parts[1].lower()
    sep = next((s for s in (" vs ", " v ", " - ") if s in low), None)
    if not sep:
        return None
    i = low.index(sep)
    home, away = parts[1][:i].strip(), parts[1][i + len(sep):].strip()
    try:
        odds = float(parts[3].replace(",", "."))
    except ValueError:
        return None
    if not home or not away or not 1 < odds < 1000:
        return None
    return dict(tipster=parts[0][:60], home=home, away=away, sel=parts[2], odds=odds)


def rows_of(text):
    return list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))


def kickoff_ms(date, time_):
    """football-data dates are dd/mm/yyyy and times are UK time."""
    from zoneinfo import ZoneInfo
    for f in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            d = dt.datetime.strptime(date.strip(), f)
            break
        except ValueError:
            d = None
    if d is None:
        return None
    try:
        h, m = (int(x) for x in (time_ or "15:00").strip().split(":")[:2])
    except ValueError:
        h, m = 15, 0
    return int(d.replace(hour=h, minute=m, tzinfo=ZoneInfo("Europe/London")).timestamp() * 1000)


def find_fixture(tip, fixtures):
    """Attach the league, kick-off time and which outcome was tipped. False when the match or the
    selection cannot be found in this week's fixtures."""
    for r in fixtures:
        if same_team(tip["home"], r.get("HomeTeam", "")) and same_team(tip["away"], r.get("AwayTeam", "")):
            side = ("D" if norm(tip["sel"]) in ("draw", "x") else
                    "H" if same_team(tip["sel"], r["HomeTeam"]) else
                    "A" if same_team(tip["sel"], r["AwayTeam"]) else None)
            ko = kickoff_ms(r.get("Date", ""), r.get("Time", ""))
            if not side or not ko:
                return False
            tip.update(div=r.get("Div", ""), date=r["Date"], home=r["HomeTeam"], away=r["AwayTeam"], side=side, ko=ko)
            return True
    return False


def season_code(ms):
    """The football season runs from August: November 2026 is '2627'."""
    d = dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc)
    start = d.year % 100 if d.month >= 8 else (d.year - 1) % 100
    return f"{start:02d}{(start + 1) % 100:02d}"


def _num(r, col):
    try:
        v = float(r.get(col) or 0)
        return v if 1 < v < 1000 else 0
    except ValueError:
        return 0


def closing_fair(r, demargin):
    """Fair chance of home, draw and away at the close, or None when the file has no closing prices."""
    ex = [_num(r, c) for c in ("BFECH", "BFECD", "BFECA")]
    if all(ex) and sum(1 / x for x in ex) <= EX_LIQUID:
        return demargin([1 / x for x in ex])
    avg = [_num(r, c) for c in ("AvgCH", "AvgCD", "AvgCA")]
    return demargin([1 / x for x in avg]) if all(avg) else None


def settle(tip, results, demargin):
    """Fill in the result from the league's results file. True when it was found."""
    for r in results:
        if r.get("Date") == tip["date"] and r.get("HomeTeam") == tip["home"] and r.get("AwayTeam") == tip["away"]:
            ftr = (r.get("FTR") or "").strip()
            if ftr not in ("H", "D", "A"):
                return False
            tip["status"] = "won" if ftr == tip["side"] else "lost"
            fair = closing_fair(r, demargin)
            if fair:
                tip["clv"] = round(tip["odds"] * fair["HDA".index(tip["side"])] - 1, 4)
            return True
    return False


def ratings(tips):
    """Per tipster, over tips captured before kick-off and since settled, at one unit a tip."""
    out = {}
    for t in tips:
        if t.get("status") not in ("won", "lost") or not t.get("counted"):
            continue
        r = out.setdefault(t["tipster"], dict(n=0, wins=0, profit=0.0, clv_n=0, clv_sum=0.0, beat=0))
        r["n"] += 1
        r["wins"] += t["status"] == "won"
        r["profit"] += t["odds"] - 1 if t["status"] == "won" else -1
        if "clv" in t:
            r["clv_n"] += 1
            r["clv_sum"] += t["clv"]
            r["beat"] += t["clv"] > 0
    for r in out.values():
        r["roi"] = r["profit"] / r["n"]
        r["clv"] = r["clv_sum"] / r["clv_n"] if r["clv_n"] else None
        r["early"] = r["n"] < MIN_TIPS
    return out


def report(tips):
    lines = ["Tipster tracker. One unit staked on every tip captured before kick-off.", ""]
    rs = ratings(tips)
    lines[0] = ("Tipster tracker, ranked by how often each beat the final price (the best early sign of skill), "
                "then by sample size. One unit staked on every tip captured before kick-off.")
    # Beating the final price settles far faster than profit, so it ranks first; a tipster with
    # fewer than 20 final prices is ranked below those with enough to judge.
    for name in sorted(rs, key=lambda n: (rs[n]["clv_n"] >= 20, rs[n]["clv"] if rs[n]["clv"] is not None else -9, rs[n]["n"]),
                       reverse=True):
        r = rs[name]
        lines.append(f"{name}: {r['n']} tips, {r['wins']} won, return {r['roi'] * 100:+.1f}% per tip"
                     + (f", beat the final price on {r['beat']} of {r['clv_n']} (average {r['clv'] * 100:+.1f}%)"
                        if r["clv_n"] else ", no final prices yet")
                     + (f". Too early to judge: under {MIN_TIPS} tips." if r["early"] else "."))
    waiting = sum(1 for t in tips if t.get("status") == "open")
    late = sum(1 for t in tips if t.get("status") in ("open", "won", "lost") and not t.get("counted"))
    unmatched = sum(1 for t in tips if t.get("status") == "unmatched")
    lines += ["", f"{waiting} waiting for a result. {late} arrived after kick-off and are not counted. "
                  f"{unmatched} could not be matched to a fixture."]
    return "\n".join(lines) + "\n"


# ---------- storage and the outside world ----------
def _path(data, name):
    return os.path.join(data, name)


def load(data):
    try:
        with open(_path(data, "tips.json")) as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return dict(since="", tips=[], fetched={})


def save(data, book):
    os.makedirs(data, exist_ok=True)
    with open(_path(data, "tips.json.tmp"), "w") as f:
        json.dump(book, f)
    os.replace(_path(data, "tips.json.tmp"), _path(data, "tips.json"))
    with open(_path(data, "tipsters.txt"), "w") as f:
        f.write(report(book["tips"]))


def new_messages(http, topic, since):
    """Messages posted to the tips topic since the last one read: [(id, unix seconds, text)]."""
    q = urllib.parse.urlencode(dict(poll=1, since=since or "12h"))
    status, _, text = http("GET", f"https://ntfy.sh/{urllib.parse.quote(topic)}/json?{q}")
    if status != 200:
        raise OSError("ntfy")
    out = []
    for line in text.splitlines():
        try:
            m = json.loads(line)
        except ValueError:
            continue
        if m.get("event") == "message" and m.get("id"):
            out.append((m["id"], int(m.get("time") or 0), str(m.get("message") or "")))
    return out


def run(http, demargin, data, now_ms):
    """One pass: read new tips, match them to fixtures, settle the ones that have finished.
    Returns counts for the log. Network trouble leaves everything for the next pass."""
    topic = os.environ.get("TIPS_TOPIC", "").strip()
    if not topic:
        return None
    book = load(data)
    fetched = book.setdefault("fetched", {})
    added = settled = 0

    def get(path, key, max_age_ms):
        """A football-data file, asked for at most once per max_age."""
        if now_ms - fetched.get(key, 0) < max_age_ms:
            return None
        status, _, text = http("GET", SRC + path, {"User-Agent": "betiq-lite tipster tracker (personal use)"})
        fetched[key] = now_ms
        return rows_of(text) if status == 200 else None

    try:
        msgs = new_messages(http, topic, book.get("since"))
    except OSError:
        msgs = []
    fixtures = None
    for mid, when, text in msgs:
        book["since"] = mid
        tip = parse_tip(text)
        if not tip:
            continue
        if fixtures is None:
            fixtures = get("/fixtures.csv", "fixtures", 0) or []
        tip.update(id=mid, at=when * 1000, status="open")
        if find_fixture(tip, fixtures):
            tip["counted"] = tip["at"] < tip["ko"]
        else:
            tip["status"] = "unmatched"
        book["tips"].append(tip)
        added += 1
    due = {}
    for t in book["tips"]:
        if t.get("status") == "open" and now_ms > t["ko"] + 3 * 3600000:
            due.setdefault((season_code(t["ko"]), t["div"]), []).append(t)
    for (season, div), tips in due.items():
        results = get(f"/mmz4281/{season}/{div}.csv", f"res:{season}:{div}", 6 * 3600000)
        for t in tips:
            if results and settle(t, results, demargin):
                settled += 1
            elif now_ms > t["ko"] + 21 * 86400000:
                t["status"] = "void"          # three weeks on and still no result: postponed or abandoned
    save(data, book)
    return dict(added=added, settled=settled, tips=len(book["tips"]))
