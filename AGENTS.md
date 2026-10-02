# Project architecture rules

- Use semantic color tokens and shadcn controls for interactive UI so the dark StormCircle theme remains consistent.
- Mobile secondary destinations stay lazily mounted as `MobileScreen` overlays so hidden screens do not run subscriptions.
- Mobile navigation state stays in `MobileLayout`; the command rail only presents destinations and emits selections.
- Notification preference persistence stays centralized in `NotificationSettings` and its existing `notification_prefs` row.
- Desktop hazard/chat expansion state stays in `Index` so the two independently rendered overlays remain synchronized.