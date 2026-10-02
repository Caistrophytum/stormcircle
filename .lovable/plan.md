# Linked desktop hazards and chat panels

## What will change
- Add a minimize control to the desktop chat panel.
- Keep the existing minimize control on the Top 10 Hazards panel.
- When Top 10 Hazards is minimized, expand chat into the released vertical space.
- When chat is minimized, expand Top 10 Hazards into the released vertical space.
- Restoring either panel returns both to their normal balanced sizes.

## Technical details
- Keep the shared desktop panel state in the page layout and pass controlled state to the hazards and chat panels.
- Preserve all existing alert, chat, mobile, and subscription behavior.
- Animate only panel height and content visibility, with accessible labels on both controls.
- Verify both directions in the desktop preview and confirm a clean build.
