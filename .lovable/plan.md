## Goal

Add a "Join Report" button to each report stack in the Public Weather Reports panel. Logged-in users can click it once per stack to post a "[username] has joined the report." message into that stack's topic.

## UX

- Button appears centered in the stack header, always visible (collapsed or expanded), only for signed-in users — guests see nothing.
- Sits on its own row beneath the topic text so it doesn't crowd the meta row.
- Once the user has joined that stack (i.e. the stack already contains a join message authored by them), the button is replaced with a muted "✓ Joined" label.
- Clicking the button is independent of expand/collapse (stop event propagation).

## Message format

- Content sent: `{username} has joined the report.`
- Posted as a normal `messages` row using the existing INSERT path (same RLS, same realtime feed).
- The grouping signature of "has joined the report" is shared across all join messages, so they would normally collapse into their own stack. To keep the join inside its parent topic, the inserted message will reuse the parent stack's topic text by appending it: `{username} has joined the report — {stack.topic}`. This makes the signature match the parent stack, so it appears nested inside it.

## Detecting "already joined"

- Check `stack.reports` for any message where `user_id === currentUser.id` and `content` starts with `"{username} has joined the report"`.
- Purely client-side derivation; no schema changes.

## Implementation details

- File: `src/components/CitizenReports.tsx` only. No DB migration, no new hook.
- Add `joinReport(stack)` async handler near `approveStack`/`unapproveStack` that inserts the message via `supabase.from("messages").insert(...)`. Toast on error.
- In the stack header render block (around line 547, after the latest-comment preview, before the action row), render:
  - If `!user`: nothing.
  - If user already joined: centered `<span>✓ Joined</span>` styled muted/mono.
  - Else: centered `<button>Join Report</button>` styled with neon-amber border (matches existing approve button language but in primary color).
- Wrap in a flex `justify-center` container with `pt-1`, and call `e.stopPropagation()` on the click so it doesn't toggle expand.

## Out of scope

- No new table, no per-user join tracking table.
- No "leave report" action.
- Join messages still obey the 2-hour rolling window like every other message.
