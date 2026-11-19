# BetIQ Lite

See `HANDOFF.md` for what the app is, how to run and test it, and where things live.

## Design

- This app uses the Belbo design kit: github `belboapps/belbo-design`, local copy `~/code/belbo-design`.
  Follow its `DESIGN.md` (colours, type scale, spacing, components, accessibility).
- The page is `<html lang="en-GB" data-app="betiq-lite">` (deep cyan accent) with `<body class="b-page">`,
  and links `belbo/belbo.css` relatively, so it works from GitHub Pages, `file://` in the tests, and the home
  server (`server/web.py` serves `/belbo/belbo.css` and the font; `scripts/deploy.sh` copies `belbo/`).
- Never hand-edit the copied `belbo/` folder. To update it, change the kit and re-run
  `~/code/belbo-design/scripts/install.sh <this repo's root>`, then commit `belbo/`.
- The app's own CSS (the `<style>` block in `index.html`) uses `--b-*` tokens only: no new literal colours.
  Verdicts (PLACE, CONSIDER, WAIT, SKIP, CHECK FIRST) and badges are status: status colours with an icon and a
  word, never the accent. One accent button per screen (the top bet's main button).
- Browser tests read class names and visible text (including a few upper-case labels set in CSS), so keep
  class names and those labels when restyling.
