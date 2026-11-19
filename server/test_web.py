import json, os, tempfile, threading, unittest, urllib.error, urllib.request

import betiqdb
import web


class Store(unittest.TestCase):
    def setUp(self):
        self.c = betiqdb.connect(os.path.join(tempfile.mkdtemp(), "b.db"))

    def bet(self, pid, m, **kw):
        return dict(pid=pid, practice=False, m=m, data=dict(pid=pid, status="open", **kw))

    def test_each_person_sees_only_their_bets(self):
        betiqdb.handle(self.c, "POST", "/rest/v1/bets?on_conflict=user_id,pid,practice", [self.bet("a", 1)], user="me@x.com")
        betiqdb.handle(self.c, "POST", "/rest/v1/bets", [dict(self.bet("b", 1), user_id="me@x.com")], user="other@x.com")
        mine = betiqdb.handle(self.c, "GET", "/rest/v1/bets?select=pid&user_id=eq.other@x.com", user="me@x.com")
        self.assertEqual([r["pid"] for r in mine], ["a"])                 # a user_id filter cannot widen it
        theirs = betiqdb.handle(self.c, "GET", "/rest/v1/bets", user="other@x.com")
        self.assertEqual([(r["pid"], r["user_id"]) for r in theirs], [("b", "other@x.com")])   # sent user_id ignored
        everyone = betiqdb.handle(self.c, "GET", "/rest/v1/bets?select=user_id,pid,practice,m,data&limit=10000")
        self.assertEqual(len(everyone), 2)                                 # the agent sees all

    def test_upsert_and_agent_queries(self):
        betiqdb.handle(self.c, "POST", "/rest/v1/bets", [self.bet("a", 1)], user="me@x.com")
        betiqdb.handle(self.c, "POST", "/rest/v1/bets", [dict(self.bet("a", 5, close={"f": 2.0}), user_id="me@x.com")])
        q = "/rest/v1/bets?user_id=eq.me%40x.com&pid=eq.a&practice=eq.false&select=user_id,pid,practice,m,data"
        rows = betiqdb.handle(self.c, "GET", q)
        self.assertEqual((len(rows), rows[0]["m"], rows[0]["data"]["close"]["f"]), (1, 5, 2.0))
        self.assertEqual(betiqdb.handle(self.c, "GET", "/rest/v1/bets?practice=eq.true"), [])
        with self.assertRaises(betiqdb.BadRequest):
            betiqdb.handle(self.c, "GET", "/rest/v1/bets?m=gt.0")
        with self.assertRaises(betiqdb.BadRequest):
            betiqdb.handle(self.c, "POST", "/rest/v1/bets", [{"pid": "x"}], user="me@x.com")

    def test_shared_prices_file(self):
        users = betiqdb.handle(self.c, "GET", "/auth/v1/admin/users")["users"]
        betiqdb.handle(self.c, "POST", "/rest/v1/files?on_conflict=user_id,name",
                       [dict(user_id=u["id"], name="fixtures", body="Div,HomeTeam", fetched_at="2026-11-19T10:00:00+00:00") for u in users])
        rows = betiqdb.handle(self.c, "GET", "/rest/v1/files?name=eq.fixtures&select=body,fetched_at&limit=1", user="me@x.com")
        self.assertEqual(rows[0]["body"], "Div,HomeTeam")
        with self.assertRaises(betiqdb.BadRequest):
            betiqdb.handle(self.c, "POST", "/rest/v1/files", [{}], user="me@x.com")      # people cannot write it
        with self.assertRaises(betiqdb.BadRequest):
            betiqdb.handle(self.c, "GET", "/auth/v1/admin/users", user="me@x.com")

    def test_import_from_supabase_keeps_the_newer_copy(self):
        betiqdb.handle(self.c, "POST", "/rest/v1/bets", [self.bet("a", 9)], user="me@x.com")
        rows = [dict(self.bet("a", 3), user_id="uuid1"), dict(self.bet("b", 3), user_id="uuid1"),
                dict(self.bet("c", 3), user_id="unknown")]
        self.assertEqual(betiqdb.import_rows(self.c, rows, {"uuid1": "me@x.com"}), 1)
        got = {r["pid"]: r["m"] for r in betiqdb.handle(self.c, "GET", "/rest/v1/bets", user="me@x.com")}
        self.assertEqual(got, {"a": 9, "b": 3})


class Web(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, "page"))
        with open(os.path.join(d, "page", "index.html"), "w") as f:
            f.write("<html><head><title>x</title></head><body>hi</body></html>")
        os.makedirs(os.path.join(d, "page", "belbo", "fonts"))
        with open(os.path.join(d, "page", "belbo", "belbo.css"), "w") as f:
            f.write(":root{}")
        with open(os.path.join(d, "page", "belbo", "fonts", "PlusJakartaSans-Variable.woff2"), "wb") as f:
            f.write(b"wOF2")
        web.PAGE_DIR = os.path.join(d, "page")
        web.DB = betiqdb.connect(os.path.join(d, "b.db"))
        web.who = lambda headers: {"good": "me@x.com"}.get(headers.get("Cf-Access-Jwt-Assertion"))
        cls.srv = web.ThreadingHTTPServer(("127.0.0.1", 0), web.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def req(self, path, tok=None, body=None, **headers):
        h = dict(headers)
        if tok:
            h["Cf-Access-Jwt-Assertion"] = tok
        if body is not None:
            h.setdefault("Content-Type", "application/json")
        r = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, headers=h)
        try:
            with urllib.request.urlopen(r) as resp:
                t = resp.read()
                return resp.status, t
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_page_is_marked_as_the_server_copy(self):
        os.environ["DASHBOARD_URL"] = "https://dash.example.co.uk"
        self.addCleanup(os.environ.pop, "DASHBOARD_URL")
        code, body = self.req("/")
        self.assertEqual(code, 200)
        self.assertIn(b"window.BETIQ_SERVER = true;", body)
        self.assertIn(b"https://dash.example.co.uk/public/home.js", body)

    def test_design_kit_is_served(self):
        self.assertEqual(self.req("/belbo/belbo.css"), (200, b":root{}"))
        self.assertEqual(self.req("/belbo/fonts/PlusJakartaSans-Variable.woff2"), (200, b"wOF2"))
        self.assertEqual(self.req("/belbo/../server/web.py")[0], 404)
        self.assertEqual(self.req("/belbo/tailwind.css")[0], 404)

    def test_data_needs_the_login_pass(self):
        self.assertEqual(self.req("/rest/v1/bets")[0], 401)
        self.assertEqual(self.req("/rest/v1/bets", tok="forged")[0], 401)
        code, _ = self.req("/rest/v1/bets", tok="good", body=[dict(pid="a", practice=False, m=1, data={"pid": "a"})])
        self.assertEqual(code, 204)
        code, body = self.req("/rest/v1/bets?select=pid,practice,m,data&limit=10000", tok="good")
        self.assertEqual((code, [r["pid"] for r in json.loads(body)]), (200, ["a"]))

    def test_changes_from_other_websites_refused(self):
        code, _ = self.req("/rest/v1/bets", tok="good", body=[], **{"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(code, 403)
        code, _ = self.req("/rest/v1/bets", tok="good", body=[], **{"Content-Type": "text/plain"})
        self.assertEqual(code, 415)

    def test_results_need_the_login_pass_and_a_known_league(self):
        self.assertEqual(self.req("/results?div=E0")[0], 401)
        self.assertEqual(self.req("/results?div=../x", tok="good")[0], 400)
        self.assertEqual(self.req("/results", tok="good")[0], 400)


class Results(unittest.TestCase):
    CSV = "﻿Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,B365H\n" + "".join(
        f"E0,{d:02d}/08/2026,15:00,Home{d},Away{d},{d % 3},1,H,2.1\n" for d in range(1, 100))

    def setUp(self):
        web._results.clear()

    def test_season_code(self):
        self.assertEqual(web.season_code(1795046400), "2627")     # 19 Nov 2026
        self.assertEqual(web.season_code(1804464000), "2627")     # 8 Mar 2027
        self.assertEqual(web.season_code(1817078400), "2728")     # 1 Aug 2027

    def test_trimmed_like_the_helper(self):
        lines = web.slim_results(self.CSV).split("\n")
        self.assertEqual(lines[0], "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR")
        self.assertEqual(len(lines), 81)
        self.assertEqual(lines[-1], "E0,99/08/2026,15:00,Home99,Away99,0,1,H")
        self.assertIsNone(web.slim_results("a,b\n1,2"))

    def test_kept_three_hours_and_old_copy_used_if_the_site_fails(self):
        calls = []
        def get(url):
            calls.append(url)
            return self.CSV
        def broken(url):
            raise OSError("down")
        t = 1794700800
        first = web.fetch_results("E0", now=t, get=get)
        self.assertEqual(calls, ["https://www.football-data.co.uk/mmz4281/2627/E0.csv"])
        self.assertEqual(web.fetch_results("E0", now=t + 3600, get=get), first)
        self.assertEqual(len(calls), 1)
        self.assertEqual(web.fetch_results("E0", now=t + 4 * 3600, get=broken), first)
        self.assertIsNone(web.fetch_results("E1", now=t, get=broken))


if __name__ == "__main__":
    unittest.main()


class AgentOnServerStore(unittest.TestCase):
    def test_agent_reads_and_writes_the_server_store(self):
        import betiq_agent as ag
        path = os.path.join(tempfile.mkdtemp(), "b.db")
        os.environ["BETIQ_DB"] = path
        self.addCleanup(os.environ.pop, "BETIQ_DB")
        ag._DB = None
        self.addCleanup(setattr, ag, "_DB", None)
        betiqdb.handle(betiqdb.connect(path), "POST", "/rest/v1/bets", [dict(pid="a", practice=False, m=1, data={"pid": "a"})], user="me@x.com")
        self.assertEqual([r["pid"] for r in ag.fetch_rows()], ["a"])
        real = ag.http
        ag.http = lambda *a, **k: (200, {}, "Div,Date,HomeTeam,AwayTeam\n")
        self.addCleanup(setattr, ag, "http", real)
        self.assertTrue(ag.store_weekly_file({}, 10 ** 13))
        rows = betiqdb.handle(betiqdb.connect(path), "GET", "/rest/v1/files?name=eq.fixtures", user="me@x.com")
        self.assertTrue(rows[0]["body"].startswith("Div,Date"))
