# StormCircle UI cleanup

## Goal
Make notification preferences faster to scan on every screen, and replace the crowded mobile button row with one clear navigation control.

## Notification settings on all screen sizes
- Restyle the block in the selected Tactical Command Hub direction using the Signal Spectrum palette, JetBrains Mono headings, and Work Sans body copy.
- Keep every existing preference and its current save behavior unchanged.
- Replace the long flat list with compact emoji-led groups:
  - 🔔 Delivery: master notifications and browser push
  - ⚠️ Weather: new alerts, upgrades, WRS changes, SPC, fire outlooks, and WRS threshold
  - 💬 Community: chat reports and local or all scope
  - 🌤️ Tomorrow: daily recap, the existing 4 AM to 11 AM slider, exercise inclusion, and activity choices
  - 🌙 Quiet time: start and end times
- Make each group a proper accessible accordion button with a short status summary when closed. Only one group opens at a time to reduce page length.
- Shorten labels and helper text while retaining important limits, location requirements, disabled states, loading feedback, and save feedback.
- Use compact dark surfaces, small corner radii, semantic status colors, and clear focus states. Emojis provide the main visual grouping without making the interface playful.

## Mobile navigation
- Replace the six floating action buttons and hide/show chevron with one 44px menu button.
- Opening it dims the current screen and slides in a compact left command rail.
- Include all six destinations with an icon, title, and brief description in this order: Radar, Alerts, Chat, Exercise Comfort, General Settings, and Q&A.
- Selecting a destination closes the rail and opens the existing full-screen destination. No screen content, data flow, or navigation destination changes.
- Close the rail by tapping the dimmed area, pressing Escape, or using the menu control. Lock background scrolling while open and restore focus when closed.
- Keep the menu control available on the main mobile screen. Existing destination overlays retain their Return control.
- Add short slide and fade transitions, with reduced-motion support.

## Technical details
- Update `NotificationSettings.tsx` with local accordion state and reusable group rows while preserving its existing preferences object and save function.
- Refactor `MobileFloatingButtons.tsx` into the single trigger, dimming layer, and left command rail controlled by `MobileLayout.tsx`.
- Keep `MobileScreen.tsx` focused on the existing destination overlays, adjusting only navigation presentation where needed.
- Add narrowly scoped semantic styles and motion rules to the shared stylesheet. Do not introduce backend, notification-delivery, or routing changes.
- Verify keyboard behavior, mobile touch targets, current preference persistence, every menu destination, desktop notification settings, and mobile layouts at narrow and wider widths.
