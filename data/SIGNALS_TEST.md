# Two extra tests on the history database

Run with `python3 signals_test.py` from the folder holding `hist2.sqlite` (built by `history_build.py` with the extended league list).

```
=== TIMING: flagged value bets, opening best odds vs closing best odds (Max) ===
flagged bets with closing prices: 194
best price SHORTER by kick-off: 63%  about the same: 20%  LONGER: 18%
average closing/opening best price ratio: 0.958  (i.e. price typically 4.2% worse by kick-off)
still flagged as value at the best closing price: 39%

=== FORM / H2H beyond the market (home-win and away-win outcomes, market = demargined Avg opening odds) ===
matches with enough history: 78943
group                                               n  home win: actual - market    away win: actual - market   
form: about level                               28251   -0.5 pts (+/-0.6)           +0.0 pts (+/-0.5)
form: away form better (-0.4 to -1)             14942   +0.0 pts (+/-0.7)           -0.4 pts (+/-0.7)
form: away form much better (-1 or less)        11368   +0.2 pts (+/-0.8)           +0.2 pts (+/-0.9)
form: home form better (+0.4 to +1)             13996   -0.2 pts (+/-0.8)           -0.1 pts (+/-0.7)
form: home form much better (+1 ppg or more)    10386   +0.0 pts (+/-0.9)           +0.0 pts (+/-0.7)
h2h: H2H about even                             25220   -0.3 pts (+/-0.6)           -0.2 pts (+/-0.5)
h2h: away team dominates H2H                    15922   -0.2 pts (+/-0.7)           +0.5 pts (+/-0.7)
h2h: home team dominates H2H                    14805   +0.1 pts (+/-0.7)           -0.6 pts (+/-0.6)

Reading: if the market already knows about form and H2H, every number sits near 0 within its +/-.
```
