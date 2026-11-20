# Stage 8 — trend growth and integration acceptance

Status: development branch only; user acceptance required before production publication.
Base: main cffe94f607c9a5b44fe82385fd637e1289570c2b (Daily Insight 3.0.2 stage 7).

## Delivered

- Visible 趨勢升溫 navigation; 7/30/90 completed Taiwan calendar days compared with the immediately preceding equal window.
- Site-observed newly indexed, canonical-URL-deduplicated reports. This is not an estimate of public interest or independent verification.
- Event aliases allow merged events to retain historical attribution. Topic aggregation uses the topic recorded on the observation date.
- First instrumented snapshot establishes a baseline. Repeated collections preserve same-day observations; missing days are not fabricated.
- Last daily check at/after 18:00 Taipei closes a day; today remains excluded from comparison even when closed.
- Completeness requires every day in both windows. Missing/unclosed/baseline-only days block percentages. Zero previous count displays counts, never infinity.
- Warming threshold: at least 2 additional observations and at least 20% growth, only with complete windows and positive baseline.
- Existing overview, watch, event detail, and report screens expose the metrics. Report-period 90 is compatible with existing backup format/storage keys.
- Retain 181 snapshots so 180 completed days remain available alongside today.
- Four isolated preview scenarios: complete, missing log, zero previous count, legacy insufficient history. All articles and historical figures in this preview are fictional.

## Validation

| Check | Result |
| --- | --- |
| New metric/actual controller integration tests | Passed |
| New collector tests (5), including 183 writes to temporary history | Passed |
| Existing trends Python tests (7) | Passed |
| Article loading, queues, reader context, stage 5/6/7 frontend and backup regression | Passed |
| Browser 7/30/90 and all four scenarios | Passed |
| Browser reports/watch/event detail routes | Passed |
| Browser keyboard Tab focus and 44px period buttons | Passed |
| Responsive layout at 340 CSS px through browser zoom | No document overflow; cards single column; table scroll confined |
| Synthetic 180-event × 180-day panel render in Node | 352 ms on this development machine; not a mobile performance claim |
| Physical phone/Safari and installed PWA | Pending before production release |

The official history currently contains only two legacy snapshots. They cannot establish daily event increments, so the feature correctly reports insufficient data until new observations accumulate. No invented history has been written into data/*.json. News schedules, production data, main, and the official URL remain untouched.

## Acceptance

Open preview/stage8-acceptance.html. Switch the four data scenarios, then 7/30/90 days. Check overview, event details → 收錄變化, 我的關注, and 週月報告. Preview state is in memory only and resets on reopening. The standalone preview does not install a service worker or write the reader's production localStorage.
