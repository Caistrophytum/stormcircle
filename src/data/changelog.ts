/**
 * StormCircle changelog - shown in Account Center → Recent Updates.
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
    date: "2026-10-01 17z",
    tag: "NEW",
    title: "Support Me?",
    body: "Added a new PayPal-powered support option in the Q&A/FAQ page, in order to keep StormCircle running without any external obligations, plus a few additional small fixes. Cheers!",
  },
  {
    date: "2026-09-26 20z",
    tag: "IMPROVED",
    title: "UI 2.0 - Mobile",
    body: "The UI overhaul continues for the mobile version, with clearer menus and a neater front page. I also capialized all of the titles' first letters in this very page.",
  },
  {
    date: "2026-09-16 09z",
    tag: "NEW",
    title: "News Headbar For Warning Fluctuations",
    body: "Shows the fluctuations of warnings today in comparison to the last three days, worldwide. Just a fun lil' thing, isn't it?",
  },
  {
    date: "2026-08-30 19z",
    tag: "NEW",
    title: "Eurozone Is Here!",
    body: "The european warnings AND RADARS are live on StormCircle! Complete with enhanced geometry.",
  },
  {
    date: "2026-08-29 13z",
    tag: "NEW",
    title: "Notifications and Other Updates",
    body: "Added in-site and push notifications for various uses. I will expand into the EU warnings next to provide the most accurate experience.",
  },
  {
    date: "2026-08-11 07z",
    tag: "IMPROVED",
    title: "Minor But Significant Changes",
    body: "mid-lift > 700hpa lapse rate, added an international/local toggle on the top 10 hazards list.",
  },
  {
    date: "2026-08-04 08z",
    tag: "NEW",
    title: "IMS Warning Coverage",
    body: "Added IMS warnings to the map and to clients whom home-town falls within the warning's area of effect.",
  },
  {
    date: "2026-07-26 12z",
    tag: "IMPROVED",
    title: "Metric Changes",
    body: "Changes some metrics, their precentage weight in WRS calculation and value gate behaviour in order to ensure logical and clear WRS numeration.",
  },
  {
    date: "2026-07-17 14z",
    tag: "NEW",
    title: "The Global Update",
    body: "From now on, the WRS, virtual & physical metrics and the chat is working for the ENTIRE WORLD! The radar, warnings and bot systems still only apply for the US only. If you have any suggestions, feel free to send them via the suggestion box.",
  },
  {
    date: "2026-07-07 07z",
    tag: "IMPROVED",
    title: "Desktop Interface V2",
    body: "Upgraded and updated the website's desktop UI to better match the look I envisioned: calm, artsy, yet attention demanding when neccessary.",
  },
  {
    date: "2026-07-01 20z",
    tag: "NEW",
    title: "Exercise-O-Meter V1",
    body: "A simple and intuitive window aiming to use environmental factors, as well as warnings, watches, alerts, and outlooks, in order to try and pinpoint the best (and worst) times to exercise. Including walking, running, biking, and hiking.",
  },
  {
    date: "2026-07-01 05z",
    tag: "NEW",
    title: "Fire Weather Rectangle",
    body: "Similarly to the convective weather outlook showing the user their current situation in their chosen hometown, the fire weather rectangle thingy does the same for fire weather.",
  },
  {
    date: "2026-06-30 06z",
    tag: "IMPROVED",
    title: "Weather Risk Score Calculation",
    body: "Enhanced the WRS calculation by introducing a logarithmic decay model for CAPE effect, and adjusting the effect of physical metrics on virtual ones, to better convey the local environment as it is rather than ask 'what if?'",
  },
  {
    date: "2026-06-13 05z",
    tag: "NEW",
    title: "Current Hazards Tab",
    body: "A new tab appearing when there's an active weather hazard (warning/advisory/etc.) in your hometown.",
  },
  {
    date: "2026-05-27 06z",
    tag: "NEW",
    title: "Fire Weather Bot",
    body: "A new automated weather system has been introduced - a fire weather 'bot'.",
  },
  {
    date: "2026-05-27 08z",
    tag: "IMPROVED",
    title: "Backend Performance II",
    body: "More disk and server usage improvement.",
  },
  {
    date: "2026-05-19 11z",
    tag: "IMPROVED",
    title: "Backend Performance",
    body: "I think I'm done batteling with the code. It's supposed to be going smoothly now. I hope.",
  },
  {
    date: "2026-05-16 10z",
    tag: "NEW",
    title: "Mobile Support",
    body: "StormCircle is now officially supporting mobile devices! Report on the go!",
  },
  {
    date: "2026-05-14 14z",
    tag: "NEW",
    title: "FAQ page, Background Fixes and Optimizations",
    body: "Added a new FAQ page, accesible from the FAQ button near the badge on the screen's top-left section, and improved load times and overall site response times.",
  },
  {
    date: "2026-05-11 06z",
    tag: "IMPROVED",
    title: "A New Chat System Introduced",
    body: "An improved, flow-based chat system has been implemented to reduce risk of report mistakes. More incoming.",
  },
  {
    date: "2026-05-07 06z",
    tag: "NEW",
    title: "News Bar",
    body: "A new bar in the bottom of the screen, showing your local risk factor based on your entered home town.",
  },
  {
    date: "2026-05-02 10z",
    tag: "NEW",
    title: "SPC Day 1 Risk Areas In The Chat",
    body: "A new SPC Bot entity collects SPC SPC D-1 data, showing them as a form of a chat message.",
  },
  {
    date: "2026-05-01 15z",
    tag: "IMPROVED",
    title: "Chat System, Message Sorting, Grouping Behaviour",
    body: "Chat system is more intuitive overall.",
  },
  {
    date: "2026-05-01 14z",
    tag: "FIXED",
    title: "Signup Bottleneck, Verifications Not Working",
    body: "Whoops. Now users should be able to verify themselves when signing up. It should work.",
  },
  {
    date: "2026-05-01 13z",
    tag: "NEW",
    title: "Chat Category Added: General Chatbox",
    body: "For any messages that aren't meteorological - will be grouped into the General Chatbox group.",
  },
  {
    date: "2026-05-01 13z",
    tag: "IMPROVED",
    title: "Radar Buttons Size Enlarged and Alert Number In Lists Improved",
    body: "Radar blue buttons now made larger to allow easier clicking, and more alerts (10) appear in the lists.",
  },
  {
    date: "2026-04-27 20z",
    tag: "FIXED",
    title: "Radar Button Overlay and Refresh Rate",
    body: "Radar buttons now clickable through polygons, and polygons should sync with the warning list.",
  },
  {
    date: "2026-04-27 9z",
    tag: "NEW",
    title: "Live Online Presence Counter",
    body: "Top status bar now shows how many operators are connected in real time.",
  },
  {
    date: "2026-04-25",
    tag: "IMPROVED",
    title: "Main Screen Alert Panels",
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
    title: "Citizen Reports Stability",
    body: "Resolved duplicate-report flicker and tightened auto-approval rules for verified meteorologists.",
  },
];
