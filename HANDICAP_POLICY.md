# League handicap policy: best-rounds-v2

The backend and frontend implement the [complete specification](HANDICAP_PLAN.md). This is a custom league handicap, not an official USGA Handicap Index. Scoring allocates the stored handicap directly, applying only the format allowance. Rating and slope are used for differentials, never Course Handicap conversion.

## Calculation

At creation, configure best rounds X, recent window Y, handicap multiplier, 9/18-hole basis, and hole-score limit. Require integers `4 <= X <= Y <= 20`. Settings stay fixed for that season. Existing leagues receive X=6/Y=8 and retain their previous basis and handicap-adjusted limit.

Average all eligible rounds through round X. From X+1, average the lowest X normalized differentials among the latest Y rounds, or all available history if fewer than Y exist. Keep every round in history. Order by event time, event ID, and round ID; differential ties retain chronological order.

`scoreDifferential = (adjustedGross - courseRating) * (113 / slope)`

Separately normalize to the league basis before selecting and averaging:

`leagueDifferential = scoreDifferential * (basis / holesPlayed)`

The round-length factor is a custom league normalization step, not part of the score differential formula.

Each complete individual scorecard counts once; normalize nine-hole and eighteen-hole rounds in either direction. Round to two decimals and limit calculated values to 27 on a nine-hole basis or 54 on an eighteen-hole basis. Plus handicaps are supported. There are no fictional start rounds, paired nines, early-history deductions, exceptional-score reductions, increase caps, PCC, or expected-score service.

## Starting and scoring

Starting handicap is optional. Missing is null; zero is scratch. Before real history, use a supplied starting handicap. Otherwise the first complete individual round generates a handicap used for that same event’s net scores and applicable points. Save its pre-round handicap as null and its generated scoring handicap separately. Subsequent rounds use the handicap available before the event.

Hole limits are par + 1 through + 5, no limit, or handicap-adjusted net double bogey. Adjusted holes use the pre-round handicap; when unknown, handicap-adjusted uses par + 5. The generated first-round handicap never feeds back into its own hole adjustment. Competition gross scores remain unchanged.

Shared scramble/alternate-shot cards do not supply individual differentials. Their players need a starting handicap or previous complete individual round for net scoring; the UI explains this before opening a shared scorecard.

Verified renewals carry real history, normalized to the new basis. Explicit source-player links are preferred; legacy links require a unique account/email match. No name-based guesses. Preserve manual corrections; the next eligible round resumes averaging. A correction effective exactly at an event start applies before that round, which then resumes averaging. Omitted player-edit handicaps preserve existing values. For a changed renewal basis, carried assignments/corrections are scaled for the new basis; original records remain unchanged.

## Saved rounds and deployment

Production contains saved rounds. Neither production migrations nor a production backfill have been run as part of this implementation.

1. Back up the database and stop scoring writes for the rollout. Review a restored production copy first.
2. Deploy migrations, including `20261006000000_link_player_handicap_history`, `20261006010000_configurable_league_handicap`, and `20261006020000_handicap_multiplier`. The multiplier migration defaults existing leagues to 1.00. The configurable-handicap migration assigns X=6/Y=8, retains the previous basis, copies saved pre-handicaps into scoring snapshots, and marks events with existing scorecards as legacy scoring. It does not change saved competition results.
3. Build/deploy the API, then run `npm run handicap:backfill` using the intended database connection. This is a dry run. Review player changes, eligible-round counts, nullable values, legacy corrections, and verified renewal history against the backup. Investigate incomplete/invalid historical cards; they are excluded rather than turned into fictional rounds.
4. Run `npm run handicap:backfill -- --apply` after reviewing the dry run. This updates only current player handicaps in active leagues; archived seasons retain their saved assignments. It never updates round scores, scoring snapshots, event points, or rankings. Each league is transactional; rerunning is safe.
5. Deploy the client and verify scoring and calculation drawers before reopening scoring.

Ordinary season replay preserves migrated events’ individual/team competition values and scoring snapshots while using valid saved adjusted rounds in the new history calculation. Explicitly creating or editing scores opts that event into the new replay policy; other migrated events remain preserved. New-policy events replay deterministically after changes/removals/cancellations. Keep the backup for rollback; reverting the policy requires a coordinated API/client and database restoration.

## League handicap multiplier

The admin sets `handicapMultiplier` at league creation (0.01–1.00, default 1.00); it is fixed for the season and copied into renewal templates. Existing leagues migrate to 1.00 without changing saved rounds or handicaps.

After selecting and averaging normalized differentials, apply the multiplier once: `handicap = roundToTwoDecimals(min(maximumHandicap, averageDifferential * handicapMultiplier))`. This also applies to the first provisional handicap used for same-event scoring. Example: an average of 9.00 with multiplier 0.96 produces 8.64. Differentials and the recorded gross/net scores are not multiplied. Starting assignments and manual overrides remain the values entered; future rounds resume the multiplied calculation. Scoring-format allowances remain separate.

A configurable final percentage is supported by [GolfSoftware League Manager](https://www.golfsoftware.com/help/lmw/CalculationParameters.html). The .96 factor was part of the pre-2020 USGA system, not today's WHS ([USGA explanation](https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/world-handicap-system-usga-golf-faqs/faqs---my-handicap-changed.html)). This league setting is optional and does not make the custom formula an official Handicap Index.
