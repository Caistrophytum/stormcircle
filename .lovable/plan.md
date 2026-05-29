## Fire Weather Bot

Add a new automated bot that posts SPC Fire Weather Outlook updates into the bot messages stream, structured like the existing SPC Bot card.

### Data source
SPC Fire Weather Outlooks are published on the same NWS MapServer as the convective outlooks:
`https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_fire_outlks/MapServer/`

- Layer 0: Day 1 Fire Weather Categorical (risk areas)
  - `ELEV` Elevated, `CRIT` Critical, `EXTM` Extreme
- Layer 1: Day 1 Dry Thunderstorm areas
  - `IDRT` Isolated Dry Thunderstorm, `SDRT` Scattered Dry Thunderstorm
- Text product: `https://www.spc.noaa.gov/products/fire_wx/fwdy1.html` (.txt at `fwdy1.txt`) — used to extract the "what's causing it" parameters (RH, winds, fuels, etc.).

### Backend

**New table** `fire_outlook_state` (1-row, mirrors `spc_outlook_state`):
- `issue` text, `groups` jsonb (categorical risk groups w/ counties), `dry_thunder` jsonb (IDRT/SDRT groups), `hazards` jsonb (parameter chips: RH, wind, fuels, dry-thunder), `summary` text, `valid_window` jsonb, `discussion` text, `last_run_at`, `last_error`, `updated_at`.
- RLS: anyone can read, service_role writes (same pattern as `spc_outlook_state`). Plus GRANTs.

**New edge function** `supabase/functions/fire-poll/index.ts`:
- Same auth pattern (`Authorization: Bearer SERVICE_KEY` or `x-cron-secret: CRON_SECRET`).
- Fetch categorical + dry-thunder layers (geojson w/ geometry), pick latest `issue`.
- Skip if `issue` unchanged unless `?force=1`.
- Reuse the same `samplePoints` + `reverseGeocode` machinery (extract into `_shared/geocode.ts` so both SPC and Fire functions can share it, without changing SPC behavior).
- Parse `fwdy1.txt` to extract:
  - Valid window
  - One-line synopsis
  - Driving parameters as hazard chips: **Min RH** (e.g. "≤15%"), **Wind gusts** (e.g. "25–35 mph"), **Fuels** (e.g. "ERC 90th"), **Dry Thunder** (Isolated/Scattered). Regex-based, defensive — null if not found.
- Build a `v:1` payload mirroring SPC's shape:
  ```
  { v:1, issue, groups:[{label, riskLabel, counties}],
    dryThunder:[{label, riskLabel, counties}],
    hazards:[{kind:"rh"|"wind"|"fuels"|"dry_thunder", value, severity}],
    summary, validWindow, discussion }
  ```
- Post as bot user (reuse `BOT_USER_ID` or a dedicated fire bot uuid like `00000000-0000-0000-0000-000000000002`) with `username: "Fire Weather Bot"`, `badge: "System"`.
- Replace prior fire bot message (delete by user_id) like SPC does.

**Cron job**: schedule `fire-poll-15min` every 15 minutes via `cron.schedule` using the vault-stored `cron_secret` (same pattern as the 4 existing pollers).

### Frontend

**`SystemMessageCard.tsx`** — extend to render fire bot:
- Detect `message.username === "Fire Weather Bot"`.
- Parse the payload (same `<!--data:...-->` marker scheme).
- Card colors: amber→orange→red ramp keyed to ELEV/CRIT/EXTM (matches "severity color-coded" core rule; Critical = orange, Extreme = red).
- Header: `🔥 SPC Fire Weather Outlook — {issue}`.
- Summary line (server-built).
- Hazard chips: RH%, Wind, Fuels, Dry Thunder (color by severity).
- Two collapsible groups: **Fire Weather Risk** (ELEV/CRIT/EXTM with counties) and **Dry Thunderstorm** (IDRT/SDRT with counties), same expand/collapse pattern as SPC categorical groups.

**`LeftSidePanel.tsx`** — no changes needed: the existing bot messages query (`badge = 'System'`) already picks up the new fire bot. The dedupe key uses `user_id + issue`, so a separate bot user id keeps SPC and Fire cards from colliding.

### Technical details

Files added:
- `supabase/functions/fire-poll/index.ts`
- `supabase/functions/fire-poll/summary.ts` (parameter parsing + summary builder, mirrors `spc-poll/summary.ts`)
- `supabase/functions/_shared/geocode.ts` (extracted `samplePoints`, `reverseGeocode`, polygon helpers; SPC switches to importing from here)
- Migration creating `fire_outlook_state` with GRANTs + RLS

Files edited:
- `supabase/functions/spc-poll/index.ts` — import shared geocode helpers (behavior unchanged)
- `src/components/SystemMessageCard.tsx` — add fire-weather rendering branch

Cron created via `supabase--insert` (not migration) since it contains the project-specific URL + secret, matching the existing pattern.

### Open question
Do you want the fire bot to post **only when a CRIT/EXTM risk area exists**, or **every issue (including ELEV-only quiet days)**? SPC bot posts on any risk ≥ MRGL — I'll mirror that and post whenever any ELEV/CRIT/EXTM or dry-thunder area is issued, unless you'd rather suppress ELEV-only days.
