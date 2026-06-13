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
    date: "2026-06-13 05z",
    tag: "NEW",
    title: "Current hazards tab",
    body: "A new tab appearing when there's an active weather hazard (warning/advisory/etc.) in your hometown.",
  },
  {
    date: "2026-05-27 06z",
    tag: "NEW",
    title: "Fire weather bot",
    body: "A new automated weather system has been introduced - a fire weather 'bot'.",
  },
  {
    date: "2026-05-27 08z",
    tag: "IMPROVED",
    title: "Backend performance II",
    body: "More disk and server usage improvement.",
  },
  {
    date: "2026-05-19 11z",
    tag: "IMPROVED",
    title: "Backend performance",
    body: "I think I'm done batteling with the code. It's supposed to be going smoothly now. I hope.",
  },
  {
    date: "2026-05-16 10z",
    tag: "NEW",
    title: "Mobile support",
    body: "StormCircle is now officially supporting mobile devices! Report on the go!",
  },
  {
    date: "2026-05-14 14z",
    tag: "NEW",
    title: "FAQ page, background fixes and optimizations",
    body: "Added a new FAQ page, accesible from the FAQ button near the badge on the screen's top-left section, and improved load times and overall site response times.",
  },
  {
    date: "2026-05-11 06z",
    tag: "IMPROVED",
    title: "A new chat system introduced",
    body: "An improved, flow-based chat system has been implemented to reduce risk of report mistakes. More incoming.",
  },
  {
    date: "2026-05-07 06z",
    tag: "NEW",
    title: "News bar",
    body: "A new bar in the bottom of the screen, showing your local risk factor based on your entered home town.",
  },
  {
    date: "2026-05-02 10z",
    tag: "NEW",
    title: "SPC Day 1 risk areas in the chat",
    body: "A new SPC Bot entity collects SPC SPC D-1 data, showing them as a form of a chat message.",
  },
  {
    date: "2026-05-01 15z",
    tag: "IMPROVED",
    title: "Chat system, message sorting, grouping behaviour",
    body: "Chat system is more intuitive overall.",
  },
  {
    date: "2026-05-01 14z",
    tag: "FIXED",
    title: "Signup bottleneck, verifications not working",
    body: "Whoops. Now users should eb able to verify themselves when signing up. It should work.",
  },
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
