# Daily Insight V1.2 — Primary-source PWA

## What is implemented
- Responsive PWA for phones and desktops; official-feed headline links, categories, saved links, read markers.
- Daily GitHub Actions workflow at 00:15 UTC (08:15 Taiwan), plus manual run.
- Python standard-library RSS/Atom collector; HTTPS and approved publisher-domain checks; no AI-generated claims.
- Publisher authenticity is checked only by URL domain. This **does not verify every claim**, page content, or editorial neutrality.
- No API keys needed. No personal accounts or cross-device synchronization.

## Deploy to GitHub Pages (cloud)
1. Create a new public GitHub repository, e.g. `daily-insight`.
2. Extract the ZIP and upload **the contents** of `daily-insight-v1.2` to the repository root, including the hidden `.github/workflows/daily-news.yml` file. Alternatively use Git locally: `git init`, `git add .`, `git commit -m "Initial Daily Insight"`, add remote and push.
3. In GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**; choose `main` and `/ (root)`; Save.
4. Open **Actions → Update primary-source news → Run workflow**. Wait for the run and inspect its logs and the `data/news.json` commit. For scheduled updates the workflow runs daily; GitHub scheduled jobs can be delayed or skipped, and repository inactivity can disable schedules.
5. Open the Pages URL shown in Settings → Pages, usually `https://YOURNAME.github.io/daily-insight/` (replace YOURNAME and repository name). On phone, use the browser's “Add to Home Screen” or “Install app”.
6. If the workflow cannot push, verify **Settings → Actions → General → Workflow permissions** permits read/write, and repository rules allow GitHub Actions to commit. The workflow requests `contents: write` but repository restrictions may override it.

## Local test
Run `python -m http.server 8000` in this folder, then visit `http://localhost:8000`. To update data locally run `python scripts/update_news.py` (requires outbound network). PWA install requires HTTPS or supported localhost context.

## Sources and safety
Edit `sources.json` to add or remove primary publishers. Each source has `feed`, `allowed_hosts`, `name`, `category`. Only use RSS/Atom endpoints belonging to the original publishing institution. Feed endpoints may change or fail; inspect `data/news.json` `sources` status. A source with a redirected feed outside its allowlist is rejected. Article URLs outside the allowlist are rejected. Feeds with no publication date are skipped. The collector preserves existing valid entries during outages; they can become stale, so the UI shows publication and refresh dates. Old articles are capped to 150 by date.

**Known limitations:** Some official feeds may no longer exist, and no live network verification was performed when packaging. This project does not extract full article text, perform claim-level verification, assess factual correctness, or create AI summaries, charts or quizzes from unverified claims. The initial data file is intentionally empty. For production, add monitoring, source checks, per-claim evidence, corrections tracking, and security reviews.
