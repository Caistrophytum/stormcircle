# Chat search, password feedback, and signed-out pop-up

## Chat place search
1. Change the old US-only wording everywhere it appears:
   - Chat place picker: "Search a US city..." becomes "Search for a city..."
   - Desktop radar search and mobile radar search: "Type a US city..." becomes "Search for a city..."
2. Add a "My hometown" row at the top of the chat place list, above "My location". It shows the saved hometown name and picks it instantly, with no GPS lookup. Only shown when the user has a hometown set.

## Password feedback
3. On sign-up and on the reset-password page, show a live checklist under the password field:
   - At least 8 characters
   - At least 1 uppercase letter
   - At least 1 number
   Each line turns green when met. The reset page gets the same rules as sign-up (it currently only checks length).
4. When the server rejects a password, show a plain reason instead of the raw error, for example: "This password has appeared in a known data leak. Please choose a different one." or "Password is too weak: add more characters or mix letters and numbers."

## Signed-out pop-up
5. When someone opens StormCircle without being signed in, show a small pop-up once per visit:
   "You aren't signed in. Some key features, like alerts for your hometown and chat posting, aren't available. Sign in and set a hometown to get the full experience."
   Buttons: "Sign in" (goes to the sign-in page) and "Not now" (closes it until the next visit). It waits until the sign-in check finishes so signed-in users never see it flash.

## Technical details
- `CitizenReports.tsx` place panel: add hometown row using `useAuth().profile.location` + `useHometownCoords()`; calls `onPickPlace(label, coords)`.
- `RadarControls.tsx`, `MobileRadar.tsx`: placeholder text only.
- Shared `passwordRules` list + `PasswordChecklist` component used by `Auth.tsx` and `ResetPassword.tsx`; map Supabase `weak_password` reasons (`pwned`, `length`, `characters`) to friendly copy.
- New `SignedOutPrompt` dialog mounted at app level, gated on auth loading finished and no user, dismissal stored in `sessionStorage`; hidden on `/auth` and `/reset-password`.
