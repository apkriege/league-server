# Configurable league handicap: implemented specification

The backend and frontend implement this specification as `best-rounds-v2`. Production rollout is separate and has not been performed. [HANDICAP_POLICY.md](HANDICAP_POLICY.md) summarizes the implementation and the saved-round migration procedure.

## Agreed calculation

Admin enters two whole numbers at league creation. Require 4 <= X <= Y <= 20:

- X: initial establishment rounds and best rounds used afterward.
- Y: recent-round history window.

X determines the initial period during which all available rounds contribute; Y limits the history window. These are the only round-count inputs. Best 5 of the latest 8 rounds means X=5 and Y=8. If X=Y, the calculation becomes an average of the latest Y rounds.

X has a minimum of four, so once established the handicap averages at least four actual rounds. Provisional handicaps still update with fewer rounds. This reduces dependence on a single performance; stability also depends on Y and the player's score variability. A rolling window can still change the handicap when older counting rounds leave it.

Choose X, Y, handicap multiplier, handicap hole basis and handicap hole-score limit at league creation. These settings apply to the entire season and cannot vary by event or be changed midseason. Player handicaps still update after eligible rounds; the calculation policy is what stays fixed.

Existing leagues receive X=6 and Y=8 during migration. Preserve their existing handicap hole basis and use the existing handicap-adjusted hole-limit policy. These migrated settings then stay fixed for the season. New leagues use the admin's validated inputs; the maximum recent-round window is twenty.

Before any eligible rounds, use the optional supplied starting handicap. If omitted, keep it null (not established); zero remains a valid scratch handicap. Never add a starting handicap as a fictional score.

During the first X eligible individual rounds, average all actual normalized round differentials available, recalculating after each round. An unknown player therefore gets a provisional handicap after round one. The Xth round still uses all X rounds.

Starting with round X + 1, form a window of the latest Y eligible rounds (all available eligible rounds while fewer than Y exist), then average only its lowest X normalized differentials. Once the window contains Y rounds, the oldest round leaves it as each new round enters. The first X rounds remain real history and can contribute within the latest-Y window; they are not discarded together after establishment. Recalculate after every eligible round using the existing two-decimal handicap precision and maximum handicap bounds.

Count verified eligible rounds, not scheduled events or calendar weeks. Order them by played date/time, then event ID and round ID. Break equal-differential selection ties consistently using that ordering. Exclude invalid, incomplete, canceled and shared-team results; an individual scorecard in a team event can count if otherwise eligible.

Replay deterministically after score edits, removals or cancellations. If X or fewer eligible rounds remain, average all available rounds again. If none remain, restore the original supplied starting handicap or null. Keep actual starting assignments separate from round history.

Example with admin-entered X=5 and Y=8: differentials 12, 10, 8, 14, 9, 15, 7, 13 produce stored handicaps 12, 11, 10, 11, 10.60, 10.60, 9.20, 9.20. Rounds one through five use all available rounds. Round six uses the best five of six; round seven uses the best five of seven; round eight uses the best five of eight. A ninth differential of 11 leaves a latest-eight window of 10, 8, 14, 9, 15, 7, 13, 11. Its best five are 7, 8, 9, 10, 11, producing a handicap of 9. These are example inputs, not fixed defaults.

## Round normalization and adjusted scores

Keep one explicit nine- or eighteen-hole handicap basis for the season. Calculate each round's differential from its handicap-adjusted gross score and the valid rating/slope for the holes and tees actually played:

`playedDifferential = (adjustedGross - courseRating) * (113 / slope)`

`normalizedDifferential = playedDifferential * handicapHoleBasis / holesPlayed`

An eighteen-hole result is halved for a nine-hole basis; a nine-hole result is doubled for an eighteen-hole basis. Each completed round contributes one normalized entry with equal weight, regardless of length. Do not pair nines, leave unmatched nines pending, create fictional rounds or add an expected-score service. This is a league normalization policy, not current WHS nine-hole treatment.

At league creation, the admin selects the handicap hole-score limit:

- Par + 1, + 2, + 3, + 4 or + 5: adjusted hole score is the lesser of actual gross and that limit.
- No limit: adjusted hole score equals actual gross, with no additional hidden cap.
- Handicap-adjusted: retain the existing net-double-bogey adjustment, using the pre-round stored handicap directly for stroke allocation. Without a pre-round handicap, retain the existing par + 5 fallback for that round.

Apply the selected limit before calculating the differential. Preserve actual gross and competition results separately. Handicap-adjusted limits use the pre-round handicap, never the handicap generated by the same round.

A player's first eligible round creates a provisional handicap immediately. For example, an adjusted 45 over nine holes rated 36 with slope 113 produces a differential of 9 and a nine-hole league handicap of 9. Par 36 alone does not guarantee exactly 9: rating, slope and the selected hole limit affect the calculation. On an eighteen-hole handicap basis, the same round normalizes to 18.

## First-event scoring

If a player has no starting handicap or established real history, calculate their provisional handicap from their first eligible round and use it to score that same event's net results and applicable individual, match and team points. Do not treat them as scratch or exclude their first event from net scoring.

Process the first event in this order: validate gross hole scores; apply the season's handicap hole-score limit (par + 5 fallback if handicap-adjusted and the pre-round handicap is unknown); calculate the normalized differential and provisional handicap; then apply scoring-format allowances and allocate strokes to calculate net results and points. Do not feed the newly generated handicap back into that round's handicap-adjusted scores or add the round to history twice.

For an adjusted 45, nine-hole rating 36 and slope 113 on a nine-hole basis, generate a handicap of 9 and use that 9 for first-event scoring, subject to format allowances. At 100% allowance with gross 45, the total net score is 36; points still follow the selected event format and hole results.

Record both the genuinely unknown pre-round handicap and the generated effective scoring handicap. Preserve that scoring snapshot for history and deterministic replay. A player with a supplied starting handicap, including zero, uses that pre-round handicap for the event; their round updates their handicap for subsequent events.

## Handicap meaning

Label the result a league handicap, not an official USGA Handicap Index. Scoring strokes use the stored player handicap directly, subject only to the selected scoring format's allowance. Never convert it to a Course Handicap using rating, slope or par. Rating and slope are used only for round differentials and stored-handicap updates. Document that applying a normalized differential directly as scoring strokes is a deliberate league policy and does not provide WHS course/tee conversion equity. No PCC, automatic exceptional-score reductions or upward-movement caps are applied.

Use pre-event scoring handicaps for players who already have one; use the generated first-round handicap for unknown players as described above. Later updates apply to subsequent events. Match-play relative strokes use the players' stored handicaps after the format's allowance. Preserve zero, plus handicaps and unknown values distinctly.

## Season history

The calculation policy is fixed at league creation; no new per-round manual-handicap workflow is part of this plan. Preserve original starting assignments and legacy manual-correction records without deleting or silently reinterpreting them. Omitted handicap values on player edits preserve existing values.

Renewals carry verified real history using explicit renewal identity links. Normalize that history to the new season's explicit hole basis and count it toward X establishment rounds and the latest-Y window. An established player does not restart establishment because a new season begins. Preserve previous seasons' recorded scores, adjustments and scoring handicaps under their original policies. Confirm the new season's settings at creation.

## Implementation and rollout checklist

1. Add X/Y inputs, handicap basis and handicap hole-score limit to league creation. Validate integer 4 <= X <= Y <= 20 on the backend and frontend. Enforce the season's immutable policy on the backend as well as in the UI.
2. Make starting handicap optional in single/batch player creation, league setup and renewal. Add nullable database/API fields and preserve starting assignments, legacy corrections and renewal identity/history as described above.
3. Implement one pure backend calculation and deterministic replay following the agreed calculation, adjusted-score, normalization and first-event scoring rules above. Keep history ordering and differential selection deterministic.
4. Update existing UI only: Starting handicap (optional), Establishing · R of X rounds, and Best X of last Y rounds using the actual configured values. Through round X, the drawer must show that all available rounds contribute; show best-X selection from round X+1 and the actual available window size while fewer than Y rounds exist. Reuse the calculation drawer to show contributing rounds, normalization, hole limit and average. Label the result League handicap. Do not add new tournament options or analysis panels.
5. Verify X/Y input validation, rejection of X<4, Y<X and Y>20, X=Y=4, X=Y=20, first-round handicap generation and same-event points, supplied starting handicaps including zero, no circular first-round hole adjustment or duplicate history entries, X-to-X+1 selection transition, fewer-than-X history, intermediate history between X and Y, exactly-Y and Y+1 rolling-window history, equal-differential and chronological ties, mixed-length normalization in both directions, every hole-limit option, unknown-handicap fallback, plus handicaps, rounding/maximum bounds, edits/removals/cancellations across the selection threshold, existing manual corrections, renewals, historical scoring, policy immutability and relevant individual/team formats. Run available type checks, lint and meaningful unit/integration tests; check the rendered forms/drawer on desktop and mobile.
6. Production has saved rounds. Inventory existing scorecards, handicap history, legacy corrections and pre-event scoring snapshots. Define and validate the migration/backfill and deterministic replay path against existing data before enabling the new calculation. Preserve historical competition results and scoring handicap snapshots; migrating calculation history must not silently rewrite past results or retrospectively apply the new first-event scoring rule to archived results. Preserve existing assigned starting values. Assign existing leagues X=6/Y=8, retaining their hole basis and handicap-adjusted hole-limit policy. Deploy migrations, API and client in that order. Follow the backfill procedure in HANDICAP_POLICY.md before reopening scoring.

## League handicap multiplier

The admin sets `handicapMultiplier` at league creation (0.01–1.00, default 1.00); it is fixed for the season and copied into renewal templates. Existing leagues migrate to 1.00 without changing saved rounds or handicaps.

After selecting and averaging normalized differentials, apply the multiplier once: `handicap = roundToTwoDecimals(min(maximumHandicap, averageDifferential * handicapMultiplier))`. This also applies to the first provisional handicap used for same-event scoring. Example: an average of 9.00 with multiplier 0.96 produces 8.64. Differentials and the recorded gross/net scores are not multiplied. Starting assignments and manual overrides remain the values entered; future rounds resume the multiplied calculation. Scoring-format allowances remain separate.

A configurable final percentage is supported by [GolfSoftware League Manager](https://www.golfsoftware.com/help/lmw/CalculationParameters.html). The .96 factor was part of the pre-2020 USGA system, not today's WHS ([USGA explanation](https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/world-handicap-system-usga-golf-faqs/faqs---my-handicap-changed.html)). This league setting is optional and does not make the custom formula an official Handicap Index.
