"""Run with: python3 -m unittest discover server"""
import datetime as dt
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["BETIQ_DATA"] = tempfile.mkdtemp()
os.environ["BETIQ_BACKUP_DIR"] = tempfile.mkdtemp()
import betiq_agent as A

NOW = 1_800_000_000_000


def bet(pid, **k):
    return dict(dict(pid=pid, evId="e" + pid, key="soccer_epl", sel="Arsenal", odds=2.0, stake=10, status="open",
                     profit=0, time=NOW + 20 * 60000, at=NOW - 86400000), **k)


def row(b, practice=False):
    return dict(user_id="u1", pid=b["pid"], practice=practice, m=1, data=b)


def event(eid, prices):
    """prices: {bookmaker key: [home, draw, away]}"""
    return dict(id=eid, bookmakers=[dict(key=k, markets=[dict(key="h2h", outcomes=[
        dict(name="Arsenal", price=p[0]), dict(name="Draw", price=p[1]), dict(name="Everton", price=p[2])])])
        for k, p in prices.items()])


class Fair(unittest.TestCase):
    def test_demargin_adds_up_and_takes_more_off_long_shots(self):
        q = [1 / 1.5, 1 / 4.0, 1 / 7.0]
        f = A.demargin(q)
        self.assertAlmostEqual(sum(f), 1.0, places=6)
        self.assertGreater(q[2] / f[2], q[0] / f[0])

    def test_average_of_bookmakers(self):
        f = A.fair_h2h(event("e", {"a": [2.0, 3.5, 3.8], "b": [2.1, 3.4, 3.6], "c": [1.95, 3.6, 4.0]}))
        self.assertAlmostEqual(sum(f.values()), 1.0, places=5)
        self.assertTrue(0.45 < f["Arsenal"] < 0.5)

    def test_busy_exchange_is_the_yardstick_and_a_thin_one_is_not(self):
        books = {"a": [2.0, 3.5, 3.8], "b": [2.1, 3.4, 3.6]}
        busy = A.fair_h2h(event("e", dict(books, betfair_ex_uk=[1.6, 4.4, 7.0])))     # adds up to about 99.5%
        self.assertAlmostEqual(busy["Arsenal"], A.demargin([1 / 1.6, 1 / 4.4, 1 / 7.0])[0], places=6)
        thin = A.fair_h2h(event("e", dict(books, betfair_ex_uk=[1.5, 3.0, 5.0])))     # 120%: not trusted
        self.assertLess(thin["Arsenal"], 0.6)

    def test_a_bookmaker_missing_an_outcome_is_left_out(self):
        full = {"a": [2.0, 3.4, 4.0], "b": [2.0, 3.4, 4.0], "c": [2.0, 3.4, 4.0]}
        honest = A.fair_h2h(event("e", full))
        partial = event("e", full)
        partial["bookmakers"].append(dict(key="betfair_ex_uk", markets=[dict(key="h2h", outcomes=[
            dict(name="Arsenal", price=2.04), dict(name="Everton", price=4.2)])]))
        got = A.fair_h2h(partial)
        self.assertAlmostEqual(got["Arsenal"], honest["Arsenal"])
        self.assertLess(got["Arsenal"] * 2.0 - 1, 0)          # not shown as value: the honest edge is negative

    def test_too_few_bookmakers(self):
        self.assertEqual(A.fair_h2h(event("e", {"a": [2.0, 3.5, 3.8]})), {})
        self.assertEqual(A.fair_h2h({}), {})


class Closings(unittest.TestCase):
    def test_which_bets_are_due(self):
        due = A.due_for_closing([
            bet("1"),                                              # 20 minutes to go
            bet("2", time=NOW + 60 * 60000),                       # too early
            bet("3", time=NOW - 1),                                # kicked off
            bet("4", status="won"),
            bet("5", mkt="totals"),                                # not a match-result bet
            bet("6", close=dict(f=0.5, at=NOW - 5 * 60000)),       # saved five minutes ago
            bet("7", close=dict(f=0.5, at=NOW - 30 * 60000)),      # saved long enough ago to refresh
        ], NOW)
        self.assertEqual([b["pid"] for b in due], ["1", "7"])

    def test_collect_writes_the_fair_price_back(self):
        rows = [row(bet("1")), row(bet("2", time=NOW + 3600000)),
                dict(user_id="u1", pid="9", practice=False, m=1, data=dict(deleted=True))]
        calls, written = [], []
        os.environ["ODDS_API_KEY"] = "k"
        self.addCleanup(os.environ.pop, "ODDS_API_KEY")
        real_odds, real_sb = A.fetch_odds, A._sb
        self.addCleanup(setattr, A, "fetch_odds", real_odds)
        self.addCleanup(setattr, A, "_sb", real_sb)
        def odds(key, ids):
            calls.append((key, sorted(ids)))
            return [event("e1", {"a": [2.0, 3.5, 3.8], "b": [2.1, 3.4, 3.6]})]
        def sb(method, path, body=None, prefer=None):
            if method == "GET":
                return [rows[0]]
            written.append(body[0])
        A.fetch_odds, A._sb = odds, sb
        self.assertEqual(A.collect_closings(rows, NOW), 1)
        self.assertEqual(calls, [("soccer_epl", ["e1"])])                 # one request, one credit
        self.assertEqual(written[0]["pid"], "1")
        self.assertEqual(written[0]["m"], NOW)
        self.assertTrue(0.45 < written[0]["data"]["close"]["f"] < 0.5)
        self.assertEqual(written[0]["data"]["close"]["at"], NOW)
        self.assertEqual(written[0]["data"]["stake"], 10)                 # the rest of the bet is untouched

    def test_a_bet_settled_meanwhile_is_left_alone(self):
        rows = [row(bet("1"))]
        os.environ["ODDS_API_KEY"] = "k"
        self.addCleanup(os.environ.pop, "ODDS_API_KEY")
        real_odds, real_sb = A.fetch_odds, A._sb
        self.addCleanup(setattr, A, "fetch_odds", real_odds)
        self.addCleanup(setattr, A, "_sb", real_sb)
        A.fetch_odds = lambda k, ids: [event("e1", {"a": [2.0, 3.5, 3.8], "b": [2.1, 3.4, 3.6]})]
        posts = []
        A._sb = lambda m, p, body=None, prefer=None: [row(bet("1", status="won"))] if m == "GET" else posts.append(body)
        self.assertEqual(A.collect_closings(rows, NOW), 0)
        self.assertEqual(posts, [])

    def test_no_key_no_requests(self):
        self.assertEqual(A.collect_closings([row(bet("1"))], NOW), 0)


class Money(unittest.TestCase):
    def test_month_summary(self):
        t = dt.datetime(2026, 10, 15).timestamp() * 1000
        bets = [bet("1", at=t, status="won", profit=10), bet("2", at=t, status="lost", profit=-10),
                bet("3", at=dt.datetime(2026, 11, 2).timestamp() * 1000)]
        s = A.month_summary(bets, 2026, 10)
        self.assertEqual((s["bets"], s["staked"], s["returned"], s["net"]), (2, 20.0, 20.0, 0.0))
        self.assertIsNone(A.month_summary(bets, 2026, 11)["net"])           # still open

    def test_guardian_messages_have_no_amounts_and_are_sent_once(self):
        t = dt.datetime(2026, 11, 3).timestamp() * 1000
        bets = [bet("1", at=dt.datetime(2026, 10, 15).timestamp() * 1000, status="won", profit=10, stake=25),
                bet("2", at=t, stake=60), bet("3", at=t, stake=50)]
        os.environ["BETIQ_MONTHLY_LIMIT"] = "100"
        self.addCleanup(os.environ.pop, "BETIQ_MONTHLY_LIMIT")
        state = {}
        msgs = A.guardian(bets, dt.date(2026, 11, 17), state)
        self.assertEqual(len(msgs), 2)
        self.assertFalse(any("£" in m or "110" in m or "25" in m for m in msgs))
        self.assertEqual(A.guardian(bets, dt.date(2026, 11, 18), state), [])
        with open(os.path.join(A.DATA, "spending.txt")) as f:
            self.assertIn("2026-10: 1 bets, £25.00 staked, £35.00 returned, net £+10.00", f.read())


class Rest(unittest.TestCase):
    def test_backup_once_a_day_and_prunes(self):
        for name in os.listdir(A.BACKUPS):
            os.remove(os.path.join(A.BACKUPS, name))
        open(os.path.join(A.BACKUPS, "2020-01-01.json"), "w").close()
        open(os.path.join(A.BACKUPS, "notes.txt"), "w").close()
        rows = [row(bet("1"))]
        self.assertTrue(A.backup(rows, dt.date(2026, 11, 17)))
        self.assertFalse(A.backup(rows, dt.date(2026, 11, 17)))
        self.assertEqual(sorted(os.listdir(A.BACKUPS)), ["2026-11-17.json", "notes.txt"])
        with open(os.path.join(A.BACKUPS, "2026-11-17.json")) as f:
            self.assertEqual(json.load(f), rows)

    def test_live_bets_drops_deleted_and_splits_practice(self):
        rows = [row(bet("1")), row(bet("2"), practice=True),
                dict(user_id="u1", pid="3", practice=False, m=1, data=dict(deleted=True))]
        self.assertEqual([b["pid"] for b in A.live_bets(rows, practice=False)], ["1"])
        self.assertEqual(len(A.live_bets(rows)), 2)

    def test_problem_told_on_second_sighting_then_cleared(self):
        sent = []
        real = A.notify
        self.addCleanup(setattr, A, "notify", real)
        A.notify = lambda title, body: sent.append(title) or True
        state = {}
        A.announce({"sb_down": "Supabase cannot be reached."}, state)
        self.assertEqual(sent, [])
        A.announce({"sb_down": "Supabase cannot be reached."}, state)
        A.announce({"sb_down": "Supabase cannot be reached."}, state)
        self.assertEqual(sent, ["BetIQ: something needs attention"])
        A.announce({}, state)
        self.assertEqual(sent[-1], "BetIQ: all clear")

    def test_briefing_counts_once_after_half_past_seven(self):
        real = A.now_ms
        self.addCleanup(setattr, A, "now_ms", real)
        now = dt.datetime(2026, 11, 17, 8, 0)
        A.now_ms = lambda: NOW
        bets = [bet("1", time=NOW + 3600000), bet("2", time=NOW - 5 * 3600000), bet("3", status="won")]
        state = {}
        self.assertIsNone(A.briefing(bets, now.replace(hour=7, minute=0), state))
        self.assertEqual(A.briefing(bets, now, state), "1 bet kicks off today. 1 is waiting for a result.")
        self.assertIsNone(A.briefing(bets, now, state))

    def test_one_pass_survives_supabase_being_down(self):
        real_sb, real_page, real_notify = A._sb, A.page_up, A.notify
        self.addCleanup(setattr, A, "_sb", real_sb)
        self.addCleanup(setattr, A, "page_up", real_page)
        self.addCleanup(setattr, A, "notify", real_notify)
        A.page_up = lambda: True
        A.notify = lambda *a: True
        def down(*a, **k):
            raise A.Problem("sb_down", "Supabase cannot be reached.")
        A._sb = down
        self.assertEqual(list(A.one_pass({}, dt.datetime(2026, 11, 17, 9, 0))), ["sb_down"])
        os.environ.pop("SUPABASE_URL", None)
        A._sb = real_sb
        self.assertEqual(list(A.one_pass({}, dt.datetime(2026, 11, 17, 9, 0))), ["sb_missing"])

    def test_pasted_address_is_tidied_and_the_public_key_is_refused(self):
        real = A.http
        self.addCleanup(setattr, A, "http", real)
        self.addCleanup(os.environ.pop, "SUPABASE_URL", None)
        self.addCleanup(os.environ.pop, "SUPABASE_SERVICE_KEY", None)
        seen = []
        A.http = lambda method, url, headers=None, body=None, timeout=20: seen.append(url) or (200, {}, "[]")
        os.environ.update(SUPABASE_URL="https://abc.supabase.co/rest/v1/", SUPABASE_SERVICE_KEY="sb_secret_x")
        self.assertEqual(A.fetch_rows(), [])
        self.assertTrue(seen[0].startswith("https://abc.supabase.co/rest/v1/bets?"))
        os.environ["SUPABASE_SERVICE_KEY"] = "sb_publishable_x"
        with self.assertRaises(A.Problem) as c:
            A.fetch_rows()
        self.assertEqual(c.exception.key, "sb_key_kind")


class Weekly(unittest.TestCase):
    def test_review_written_once_a_week_with_counts_only_on_the_phone(self):
        real = A.now_ms
        self.addCleanup(setattr, A, "now_ms", real)
        A.now_ms = lambda: NOW
        close = dict(f=0.55, at=NOW - 86400000 - 3600000)
        rows = [row(bet("1", status="won", profit=10, settledAt=NOW - 3600000, time=NOW - 86400000, close=close)),
                row(bet("2", status="lost", profit=-10, settledAt=NOW - 30 * 86400000)),
                row(bet("3", status="won", profit=5, settledAt=NOW - 3600000), practice=True)]
        state = {}
        msg = A.weekly_review(rows, dt.datetime(2026, 11, 23, 8, 0), state)
        self.assertEqual(msg, "Your weekly review is ready: 1 real bet and 1 practice bet settled, 1 beat the final price.")
        self.assertNotIn("£", msg)
        self.assertIsNone(A.weekly_review(rows, dt.datetime(2026, 11, 24, 8, 0), state))
        with open(os.path.join(A.DATA, "weekly.txt")) as f:
            text = f.read()
        self.assertIn("This week: 1 settled, 1 won, £10.00 staked, £+10.00 (+100.0%). Beat the final price on 1 of 1, by +10.0%", text)
        self.assertIn("All time: 2 settled, 1 won, £20.00 staked, £+0.00", text)
        self.assertIn("Too early to judge on results: 2 settled bets", text)

    def test_closing_score_ignores_prices_saved_too_early(self):
        self.assertIsNone(A.clv_of(bet("1", close=dict(f=0.55, at=NOW - 5 * 3600000))))
        self.assertAlmostEqual(A.clv_of(bet("1", close=dict(f=0.55, at=NOW))), 0.1)


FIX = "Div,Date,Time,HomeTeam,AwayTeam\nE0,21/11/2026,15:00,Arsenal,Everton\nE0,21/11/2026,17:30,Man United,Nott'm Forest\n"
RES = ("Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,AvgCH,AvgCD,AvgCA,BFECH,BFECD,BFECA\n"
       "E0,21/11/2026,15:00,Arsenal,Everton,2,0,H,1.60,4.2,6.0,1.62,4.4,6.6\n"
       "E0,21/11/2026,17:30,Man United,Nott'm Forest,1,1,D,2.0,3.5,3.8,,,\n")


class Tipsters(unittest.TestCase):
    def setUp(self):
        import tipsters
        self.T = tipsters
        self.data = tempfile.mkdtemp()
        os.environ["TIPS_TOPIC"] = "tips-topic"
        self.addCleanup(os.environ.pop, "TIPS_TOPIC", None)
        self.ko = tipsters.kickoff_ms("21/11/2026", "15:00")
        self.msgs, self.asked = [], []

    def http(self, method, url, headers=None, body=None, timeout=20):
        self.asked.append(url)
        if "ntfy.sh" in url:
            since = urllib_since(url)
            ids = [m["id"] for m in self.msgs]
            new = self.msgs[ids.index(since) + 1:] if since in ids else self.msgs
            return 200, {}, "\n".join(json.dumps(dict(m, event="message")) for m in new)
        if url.endswith("/fixtures.csv"):
            return 200, {}, "\ufeff" + FIX
        if "/mmz4281/2627/E0.csv" in url:
            return 200, {}, RES
        return 404, {}, ""

    def post(self, mid, secs, text):
        self.msgs.append(dict(id=mid, time=secs, message=text))

    def test_parsing(self):
        T = self.T
        self.assertEqual(T.parse_tip("Sam; Arsenal v Everton; Arsenal; 2.10"),
                         dict(tipster="Sam", home="Arsenal", away="Everton", sel="Arsenal", odds=2.1))
        self.assertEqual(T.parse_tip("Sam; Arsenal vs Everton; draw; 3,5")["odds"], 3.5)
        for bad in ("hello", "Sam; Arsenal Everton; Arsenal; 2", "Sam; A v B; A; evens", "Sam; A v B; A; 1.0", "; A v B; A; 2"):
            self.assertIsNone(T.parse_tip(bad), bad)
        self.assertTrue(T.same_team("Arsenal FC", "arsenal"))
        self.assertTrue(T.same_team("Nottm Forest", "Nott'm Forest"))
        self.assertFalse(T.same_team("Arsenal", "Everton"))
        self.assertEqual(T.season_code(self.ko), "2627")
        self.assertEqual(T.season_code(T.kickoff_ms("10/03/2027", "20:00")), "2627")

    def test_tip_is_logged_settled_and_rated(self):
        T, day = self.T, 86400000
        before = self.ko // 1000 - 7200
        self.post("a1", before, "Sam; Arsenal v Everton; Arsenal; 1.80")
        self.post("a2", before, "Sam; Real Madrid v Barcelona; Barcelona; 2.2")       # not in the fixtures file
        self.post("a3", before, "Sam; Man Utd v Nottingham Forest; Manchester United; 2.2")   # everyday names
        self.post("a4", self.ko // 1000 + 600, "Late Larry; Arsenal v Everton; Arsenal; 1.80")   # after kick-off
        self.post("a5", before, "not a tip at all")
        out = T.run(self.http, A.demargin, self.data, self.ko - 3600000)
        self.assertEqual(out["added"], 4)
        book = T.load(self.data)
        self.assertEqual([t["status"] for t in book["tips"]], ["open", "unmatched", "open", "open"])
        self.assertEqual([t.get("counted") for t in book["tips"]], [True, None, True, False])
        self.assertEqual(book["since"], "a5")
        self.assertEqual(T.run(self.http, A.demargin, self.data, self.ko - 1800000)["added"], 0)   # nothing read twice
        self.assertEqual(T.run(self.http, A.demargin, self.data, self.ko + 3600000)["settled"], 0)  # too soon
        out = T.run(self.http, A.demargin, self.data, self.ko + day)
        self.assertEqual(out["settled"], 3)
        tips = T.load(self.data)["tips"]
        self.assertEqual([t["status"] for t in tips], ["won", "unmatched", "lost", "won"])
        fair_home = A.demargin([1 / 1.62, 1 / 4.4, 1 / 6.6])[0]                                    # busy exchange close
        self.assertAlmostEqual(tips[0]["clv"], round(1.8 * fair_home - 1, 4))
        self.assertIn("clv", tips[2])                                                              # bookmaker average close
        r = T.ratings(tips)
        self.assertEqual(sorted(r), ["Sam"])                                                       # the late tip is never counted
        self.assertEqual((r["Sam"]["n"], r["Sam"]["wins"]), (2, 1))
        self.assertAlmostEqual(r["Sam"]["roi"], (0.8 - 1) / 2)
        self.assertTrue(r["Sam"]["early"])
        with open(os.path.join(self.data, "tipsters.txt")) as f:
            text = f.read()
        self.assertIn("Sam: 2 tips, 1 won, return -10.0% per tip", text)
        self.assertIn("Too early to judge: under 100 tips.", text)
        self.assertIn("1 arrived after kick-off and are not counted. 1 could not be matched", text)
        results_asks = [u for u in self.asked if "mmz4281" in u]
        self.assertEqual(len(results_asks), 1)                                                     # the results file was asked for once

    def test_off_without_a_topic(self):
        os.environ.pop("TIPS_TOPIC")
        self.assertIsNone(self.T.run(self.http, A.demargin, self.data, NOW))
        self.assertEqual(self.asked, [])


def urllib_since(url):
    import urllib.parse
    return urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get("since", [""])[0]


if __name__ == "__main__":
    unittest.main()
