# Is Betfair Exchange a good enough yardstick?

Run with `python3 exch_test.py` from the folder holding `hist3.sqlite` (built by `history_build.py`).

```
== Exchange overround (sum of 1/back odds) by league, 2024/25 onwards: how liquid is it? ==
  Premier League         matches 830   avg overround 1.006   liquid (<=1.025): 100%
  Bundesliga             matches 666   avg overround 1.008   liquid (<=1.025): 100%
  Serie A                matches 840   avg overround 1.008   liquid (<=1.025): 99%
  La Liga                matches 839   avg overround 1.009   liquid (<=1.025): 99%
  Championship           matches 1231  avg overround 1.010   liquid (<=1.025): 98%
  Ligue 1                matches 674   avg overround 1.013   liquid (<=1.025): 95%
  League One             matches 1229  avg overround 1.032   liquid (<=1.025): 64%
  Eredivisie             matches 693   avg overround 1.042   liquid (<=1.025): 64%
  Scottish Premiership   matches 512   avg overround 1.055   liquid (<=1.025): 46%
  League Two             matches 1238  avg overround 1.060   liquid (<=1.025): 40%
  Turkish Super Lig      matches 718   avg overround 1.096   liquid (<=1.025): 53%
  Primeira Liga          matches 678   avg overround 1.096   liquid (<=1.025): 56%
  Belgian Pro League     matches 682   avg overround 1.110   liquid (<=1.025): 42%
  Conference             matches 1255  avg overround 1.164   liquid (<=1.025): 7%
  Greek Super League     matches 473   avg overround 1.220   liquid (<=1.025): 7%

== Same seasons (2024/25 onwards), VALUE-flagged bets, each way of working out the fair price ==
UK average (the app's default)                             n=33     won 51.5% pred 41.4%  best +23.4% ±44.3  B365  +8.2% ±39.1  CLV +6.3%
Market average of all books                                n=135    won 47.4% pred 44.3%  best  +9.7% ±21.4  B365  -4.0% ±18.8  CLV +4.6%
Pinnacle as yardstick                                      n=141    won 33.3% pred 37.0%  best  -8.6% ±22.8  B365 -13.5% ±21.7  CLV +2.8%
Betfair Exchange, any liquidity                            n=304    won 37.8% pred 38.2%  best  +1.0% ±15.7  B365  -5.0% ±14.9  CLV +0.8%
Betfair Exchange, overround <= 1.040                       n=136    won 38.2% pred 36.2%  best  +6.7% ±24.4  B365  -0.9% ±22.8  CLV +3.2%
   ... its 'check price' (>12%%) bets                      n=6      won 33.3% pred 41.1%  best  -5.0% ±118.4  B365 -22.5% ±96.5  CLV +50.6%
Betfair Exchange, overround <= 1.025                       n=81     won 40.7% pred 35.6%  best +19.3% ±33.3  B365 +10.3% ±31.0  CLV +3.3%
   ... its 'check price' (>12%%) bets                      n=6      won 33.3% pred 41.1%  best  -5.0% ±118.4  B365 -22.5% ±96.5  CLV +50.6%
Betfair Exchange, overround <= 1.015                       n=39     won 41.0% pred 36.7%  best +18.4% ±47.9  B365  +9.7% ±44.9  CLV +3.1%
   ... its 'check price' (>12%%) bets                      n=5      won 20.0% pred 40.5%  best -38.0% ±121.5  B365 -50.0% ±98.0  CLV +57.7%

== Calibration of the exchange fair price when liquid (<=1.025), every outcome ==
  0-10%: n=723 predicted 7.1% actual 5.8%
  10-20%: n=3018 predicted 15.8% actual 15.5%
  20-30%: n=8489 predicted 25.8% actual 26.2%
  30-40%: n=3854 predicted 34.3% actual 34.5%
  40-50%: n=2525 predicted 44.6% actual 45.0%
  50-60%: n=1708 predicted 54.7% actual 52.2%
  60-70%: n=951 predicted 64.6% actual 63.8%
  70-80%: n=582 predicted 74.6% actual 77.8%
  80-90%: n=236 predicted 84.2% actual 82.6%

== Head to head on the SAME matches (liquid exchange, 2024/25+): whose fair price predicts better? log loss, lower is better ==
  matches compared: 4041
  Pinnacle             0.98242
  Betfair Exchange     0.98226
  All-books average    0.98264
  UK average           0.98270
```
