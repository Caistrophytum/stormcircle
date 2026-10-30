/** Short public guide pages for search visitors. Keep facts in sync with the app. */
export type Guide = {
  slug: string;
  title: string;
  description: string;
  sections: { heading: string; body: string[] }[];
};

export const guides: Guide[] = [
  {
    slug: "severe-weather-alerts-on-your-phone",
    title: "How to Get Severe Weather Alerts on Your Phone",
    description:
      "Get free severe weather alerts for your hometown on your phone with StormCircle: official US and European warnings delivered as push notifications.",
    sections: [
      {
        heading: "The short answer",
        body: [
          "Create a free StormCircle account, set your hometown, and turn on notifications. When an official warning covers your hometown, your phone gets a push notification, even when the site is closed.",
        ],
      },
      {
        heading: "Step by step",
        body: [
          "1. Open stormcircle.net on your phone and sign up for a free account.",
          "2. Set your hometown in the Account Center. Alerts are matched to this location.",
          "3. Open the notifications window and tap the settings shortcut.",
          "4. Allow notifications when your browser asks. On iPhone, first add StormCircle to your Home Screen from the Share menu, then open it from there.",
          "5. Pick what you want to hear about: weather warnings, Weather Risk Score changes, chat messages, or a daily weather recap.",
        ],
      },
      {
        heading: "Which alerts you will get",
        body: [
          "StormCircle checks official warnings from the US National Weather Service and from MeteoAlarm for participating European countries. You are notified when a warning's area actually covers your hometown, not just a nearby county.",
        ],
      },
      {
        heading: "Keep alerts working",
        body: [
          "Open StormCircle at least once a week. Accounts away for more than 7 days are paused so old devices do not get ghost notifications. Signing back in turns them on again.",
          "StormCircle adds to, and does not replace, the emergency alerts built into your phone and your local weather service.",
        ],
      },
    ],
  },
  {
    slug: "weather-risk-score",
    title: "What the Weather Risk Score (WRS) Means",
    description:
      "The StormCircle Weather Risk Score rates thunderstorm potential from 0 to 100 using CAPE, wind shear, cloud heights and moisture. Here is how to read it.",
    sections: [
      {
        heading: "The short answer",
        body: [
          "The Weather Risk Score (WRS) is a number from 0 to 100 that shows how favorable the atmosphere above a place is for strong thunderstorms right now. It refreshes every minute for your selected city or hometown.",
        ],
      },
      {
        heading: "How to read the number",
        body: [
          "0 to 30 (green): calm. Storms are unlikely or would be weak.",
          "31 to 60 (amber): some ingredients are present. Keep an eye on the sky.",
          "61 to 85 (orange): favorable for strong storms. Check warnings and radar.",
          "Above 85 (red): high-end setup. Have a plan and follow official warnings.",
        ],
      },
      {
        heading: "What goes into it",
        body: [
          "Storm ingredients: CAPE (storm fuel) carries the most weight, followed by bulk wind shear (storm organization), the equilibrium level (how tall storms can grow) and the lifted condensation level (cloud base height).",
          "CIN, the lid that holds storms back, acts as a cap on the whole score: a strong lid lowers it no matter how much fuel is available.",
          "Moisture and lapse rate: surface humidity, mid-level humidity and the 700 to 500 hPa lapse rate complete the picture.",
        ],
      },
      {
        heading: "What it is not",
        body: [
          "The WRS measures potential, not a forecast that storms will happen. Storms also need a trigger. Always follow official watches and warnings from your weather service.",
        ],
      },
    ],
  },
  {
    slug: "live-weather-warnings",
    title: "How StormCircle's Live Weather Warnings Work",
    description:
      "StormCircle maps live official weather warnings from the US National Weather Service and MeteoAlarm Europe, updated every few minutes and sorted by severity.",
    sections: [
      {
        heading: "The short answer",
        body: [
          "StormCircle collects official warnings from national weather services, cleans out duplicates, and shows them on a live map, in the Top 10 lists and in your notifications.",
        ],
      },
      {
        heading: "Where the warnings come from",
        body: [
          "United States: the National Weather Service, checked every minute.",
          "Europe and Israel: MeteoAlarm, checked every few minutes across participating countries.",
          "StormCircle never writes its own warnings. Community reports in the chat are labeled separately and are not official.",
        ],
      },
      {
        heading: "How they are cleaned up",
        body: [
          "Exact copies of the same warning are shown once. When a warning is extended or widened, only the longer or wider version stays, so the map is not cluttered with repeats. Warnings of different severity are never merged.",
        ],
      },
      {
        heading: "How they are shown",
        body: [
          "More severe warnings always sit on top on the map: Extreme, then Severe, Moderate and Minor. Tap any shape to read the full warning. The news bar tracks whether each warning type is rising or calming compared with the past three days.",
        ],
      },
    ],
  },
];
