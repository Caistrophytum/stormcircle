

## Plan: Stacked Citizen Reports with Comment Input

### What We're Building
Transform the right panel (PeerReviewQueue) to include:
1. **Stacked citizen reports** — duplicate reports about the same event are grouped and shown as "Large Hail In Tulsa (12 reports)" instead of individual entries
2. **Comment input** — a text input at the bottom for submitting new reports
3. **Working stacking** — new submissions that match existing topics increment the count; new topics create a new entry

### Data Model
Each stacked report will have:
- `topic`: normalized title (e.g., "Large Hail In Tulsa")
- `count`: number of citizen reports
- `latestTime`: most recent report time
- `type`: category tag

Initial mock data will include several pre-stacked entries with varying counts.

### UI Layout (top to bottom)
1. **Header** — "Citizen Reports" (rename from Verification Queue)
2. **Scrollable list** — stacked report cards showing:
   - Topic title + "(X reports)" badge
   - Type tag (REPORT/VISUAL/DATA)
   - Time of latest report
   - Verify/Reject buttons (keep existing pattern)
3. **Input area** (pinned bottom) — text input + submit button, styled with glass-panel aesthetic

### Stacking Logic
- Use React `useState` to hold the reports array
- On submit, normalize the input text and check if a matching topic exists (case-insensitive substring match on key terms)
- If match found: increment count, update time to "just now"
- If no match: create new entry at count 1
- Sort by count descending so most-reported items float to top

### Technical Details

**File**: `src/components/PeerReviewQueue.tsx` — full rewrite

- Replace `mockReports` with stacked report state:
  ```ts
  interface StackedReport {
    id: string;
    topic: string;
    count: number;
    latestTime: string;
    type: "REPORT" | "VISUAL" | "DATA";
  }
  ```
- Initial data: ~6 entries with counts like 47, 23, 15, 8, 4, 2
- Include "Large Hail In Tulsa" with a high count to demonstrate stacking
- Input bar at bottom with monospace styling, submit on Enter or button click
- Adding "hail tulsa" matches existing "Large Hail In Tulsa" and increments count
- List re-sorts after each addition so highest count stays on top
- Keep the stats footer below the input

