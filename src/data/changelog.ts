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
    date: "2026-05-01 13z",
    tag: "NEW",
    title: "Chat category added: General Chatbox",
    body: "For any messages that aren't meteorological - will be grouped into the General Chatbox group.",
  },
  {
    date: "2026-05-01 13z",
    tag: "IMPROVED",
    title: "Radar buttons size enlarged and alert number in lists improved",
    body: "Radar blue buttons now made larger to allow easier clicking, and more alerts (10) appear in the lists.",
  },
  {
    date: "2026-04-27 20z",
    tag: "FIXED",
    title: "Radar button overlay and refresh rate",
    body: "Radar buttons now clickable through polygons, and polygons should sync with the warning list.",
  },
  {
    date: "2026-04-27 9z",
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
