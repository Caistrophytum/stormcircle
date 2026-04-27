/**
 * StormCircle changelog — shown in Account Center → Recent Updates.
 *
 * To add a new entry, prepend it to the top of the array (newest first).
 * `tag` controls the colored badge:
 *   - "NEW"      → blue
 *   - "IMPROVED" → amber (primary)
 *   - "FIXED"    → red (destructive)
 */
export type ChangelogTag = "NEW" | "IMPROVED" | "FIXED";

export interface ChangelogEntry {
  date: string; // ISO format YYYY-MM-DD
  tag: ChangelogTag;
  title: string;
  body: string;
}

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-04-27",
    tag: "NEW",
    title: "Live online presence counter",
    body: "Top status bar now shows how many operators are connected in real time.",
  },
  {
    date: "2026-04-25",
    tag: "IMPROVED",
    title: "Main screen alert panels",
    body: "Top Hazards, Most Dangerous and New Warnings now resize precisely with the map viewport.",
  },
  {
    date: "2026-04-20",
    tag: "NEW",
    title: "Account Center",
    body: "Manage your profile, apply for the Meteorologist badge and send feedback in one place.",
  },
  {
    date: "2026-04-15",
    tag: "FIXED",
    title: "Citizen reports stability",
    body: "Resolved duplicate-report flicker and tightened auto-approval rules for verified meteorologists.",
  },
];
