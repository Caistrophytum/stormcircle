/**
 * FAQ.tsx - Frequently Asked Questions page.
 * Matches the site's Avionics Command Deck aesthetic: dark obsidian bg,
 * neon amber primary, JetBrains Mono for labels/headings, Inter for body.
 * Uses collapsible accordion items so each answer stays compact.
 */
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, HelpCircle, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type FaqItem = {
  question: string;
  answer: string | React.ReactNode;
  jsonAnswer?: string;
};

const faqs: FaqItem[] = [
  {
    question: "What is StormCircle?",
    answer:
      "StormCircle is a free, independently developed weather social network for weather enthusiasts, meteorologists, and anyone following conditions near home. It brings together community reports, official weather warnings, radar, automated weather briefings, a Weather Risk Score, and Outdoor Exercise Comfort in your browser.",
  },
  {
    question: "Who is StormCircle for?",
    answer:
      "StormCircle is for people who want to follow weather and share what they observe, from professional meteorologists and storm enthusiasts to runners, cyclists, and curious neighbours. Use it for situational awareness and planning, alongside your local weather service's forecasts and safety guidance.",
  },
  {
    question: "Who develops StormCircle?",
    answer:
      "Hi, I'm Omri, the developer of StormCircle. I've been fascinated by weather since childhood, collecting measurement instruments, studying weather models, and taking online university courses. StormCircle is my personal project for the weather community. You can reach me through the contact form in the Account Center, by email at stormcirclecontact@gmail.com, or as AspiringMolecularEngineer on Tumblr. Thanks for visiting and supporting the project.",
  },
  {
    question: "How do I report severe weather on StormCircle?",
    answer:
      "Create a free account, sign in, and open the community chat. Choose the location and weather event, then describe what you observed and when. Report choices include hail, flooding, rotation, strong winds, heat-related events, and active wildfire. Share observations rather than guesses, and never put yourself in danger to gather a report. Meteorologist accounts can approve weather report topics, but community posts are not official warnings.",
  },
  {
    question: "Is StormCircle free to use?",
    answer:
      "Yes. StormCircle is completely free to join and use. Create an account and start participating in real-time weather communication right away.",
  },
  {
    question: "How is StormCircle different from other weather apps?",
    answer:
      "StormCircle puts weather discussion and weather data together. You can compare community observations with official warnings and radar, follow automated weather briefings, and explore local conditions, thunderstorm potential, and exercise comfort without leaving the site.",
  },
  {
    question: "Can meteorologists use StormCircle professionally?",
    answer:
      "Meteorologists can share weather analysis and approve community weather report topics. Apply for a Meteorologist badge through the Account Center by describing your background, credentials, and forecasting experience. Applications are reviewed. A badge or approved topic is not a substitute for an official warning from a weather service.",
  },
  {
    question: "What severe weather data does StormCircle show?",
    answer:
      "StormCircle shows U.S. National Weather Service warnings and Local Storm Reports, NEXRAD radar, Storm Prediction Center convective and fire weather outlooks, National Hurricane Center briefings, and ENSO updates. MeteoAlarm supplies warnings for participating European countries. European and Israel radar imagery comes through RainViewer, not MeteoAlarm. These products appear across the map, report panels, and bot briefings.",
  },
  {
    question: "Does StormCircle cover weather outside the USA?",
    answer:
      "Yes. City search and local weather data use Open-Meteo and support locations worldwide. Official warnings and radar have more limited coverage: NEXRAD is a U.S. radar network, MeteoAlarm covers participating European countries, and RainViewer provides the European and Israel radar view where imagery is available. A searchable city does not necessarily have local radar or official warnings on StormCircle.",
  },
  {
    question: "Where can I find real-time storm reports near me?",
    answer:
      "Select a city on the map or set your hometown, then check the map, local hazards, and community chat. The Local and International hazard filters help separate nearby and wider events. Nearby community reports depend on what other users have posted, so an empty feed does not mean conditions are safe.",
  },
  {
    question: "What is the Weather Risk Score?",
    answer:
      "The Weather Risk Score (WRS) is StormCircle's 0 to 100 indicator of thunderstorm potential for the selected location. It combines CAPE, bulk wind shear, cloud-base height (LCL), equilibrium level (EL), convective inhibition (CIN), surface and mid-level humidity, and the mid-level temperature lapse rate. Desktop and mobile use the same scoring model. WRS is not a percentage chance of a storm, an official warning, or a complete measure of every weather hazard.",
  },
  {
    question: "What is Outdoor Exercise Comfort?",
    answer:
      "Outdoor Exercise Comfort estimates conditions for walking, running, cycling, hiking, and outdoor calisthenics on a 0 to 100 scale. It considers apparent temperature, wind and gusts, UV, air quality, and rain, with different sensitivities for each activity. Cloud cover reduces the UV contribution in the exercise screen's model. Open an activity to see its contributing factors, or check the next six hours. The score is a planning aid, not medical advice or a guarantee that exercise is safe.",
  },
  {
    question: "Can I get notifications from StormCircle?",
    answer:
      "Yes. Open Notification Settings in the Account Center, or use the settings shortcut in the notifications window. Enable delivery and choose hometown alerts, WRS changes, SPC Enhanced or higher outlooks, fire weather outlooks, community messages, or a daily weather recap. Local chat notifications cover posts within 150 km of your hometown. Push notifications also require permission on each supported browser or device. Quiet time and delivery limits can delay or suppress notifications, so do not rely on them as your only warning system.",
  },
  {
    question: "What does the daily weather recap include?",
    answer:
      "The daily recap summarises today's forecast for your hometown with descriptions of how it feels outside, wind, UV, and rain. In Notification Settings, choose a delivery hour from 4 AM to 11 AM in your configured local timezone. You can also select activities to receive suggested upcoming two-hour exercise windows. The scheduled check runs every five minutes, so delivery is not guaranteed at the exact minute. Quiet time postpones the recap until that window ends. Exercise suggestions exclude times that have already passed.",
  },
  {
    question: "How do I change my hometown or measurement units?",
    answer:
      "Set or change your hometown in the Account Center to personalise local conditions and notifications. Searching for another city changes the weather location you are viewing, but does not replace your saved hometown. Use the SI/US control to switch supported readings between metric and U.S. units. Scores, percentages, UV, and air quality indexes do not need unit conversion.",
  },
  {
    question: "Why can weather values differ between screens?",
    answer:
      "Current conditions and exercise forecasts can use different time steps and may refresh at different moments. Wind gusts are also different from sustained wind: the exercise model considers gusts when calculating discomfort. Check the selected city, units, and forecast time before comparing values. Modelled local conditions can differ from measurements at a nearby weather station.",
  },
  {
    question: "How fresh are the weather data and radar images?",
    answer:
      "StormCircle checks many live products on a shared one-minute cycle, but that does not mean every provider publishes new data each minute. Weather forecasts, radar scans, outlooks, and climate briefings have different source schedules, and some results are cached. Check the product's timestamp where available. Network or provider interruptions can delay updates; missing imagery or an empty panel is not an all-clear.",
  },
  {
    question: "Does StormCircle replace official warnings or emergency services?",
    answer:
      "No. StormCircle helps you follow conditions, but community reports and its calculated scores are not official emergency guidance. Follow your local weather service and emergency authorities, especially during dangerous weather. Do not wait for a StormCircle notification before taking protective action, and contact local emergency services if you need urgent help.",
  },
  {
    question: "How do I get started on StormCircle?",
    answer:
      "Open StormCircle.net in your browser to explore the weather map and panels. Create a free account to post community reports, save your hometown, and configure notifications. On mobile, the bottom menu opens Radar, Alerts, Chat, Exercise Comfort, Settings, and Q&A. No app download is required.",
  },
  {
    question: "Is there a StormCircle Zello channel?",
    answer: (
      <>
        Yes. StormCircle Radio is the community's Zello channel for voice communication.
        Use the Radio link beside the notification bell on desktop, or{" "}
        <a
          href="https://on.zello.com/t5xn213"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
        >
          open StormCircle Radio on Zello
        </a>{" "}
        to join. It is not an emergency service.
      </>
    ),
    jsonAnswer:
      "Yes. StormCircle Radio is the community's Zello channel for voice communication. Use the Radio link beside the notification bell on desktop, or visit https://on.zello.com/t5xn213 to join. It is not an emergency service.",
  },
];

const PAYPAL_BASE = "https://paypal.me/OmriHazut";
const PRESET_AMOUNTS = [2, 5, 10, 25];

export default function FAQ({ hideBackButton = false }: { hideBackButton?: boolean } = {}) {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [customAmount, setCustomAmount] = useState("");
  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  // Custom amount: accept "7" or "7,50"; clamp to a sane PayPal.me range.
  const parsedCustom = parseFloat(customAmount.replace(",", "."));
  const customValid = Number.isFinite(parsedCustom) && parsedCustom >= 1 && parsedCustom <= 10000;
  const customHref = customValid
    ? `${PAYPAL_BASE}/${parsedCustom.toFixed(2).replace(/\.00$/, "")}`
    : PAYPAL_BASE;

  return (
    <>
      <Helmet>
        <title>FAQ - StormCircle Weather Social Network</title>
        <meta
          name="description"
           content="Learn about StormCircle weather warnings, radar coverage, Weather Risk Score, exercise comfort, daily recaps, notifications, and community reports."
        />
        <link rel="canonical" href="https://stormcircle.net/faq" />
        <meta property="og:title" content="StormCircle FAQ - Your Questions Answered" />
        <meta
          property="og:description"
           content="Answers about StormCircle radar, warnings, weather scores, exercise comfort, daily recaps, and community reports."
        />
        <meta property="og:url" content="https://stormcircle.net/faq" />
        <meta property="og:type" content="website" />
        {/* Structured answers mirror the visible FAQ content. */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: f.jsonAnswer ?? (typeof f.answer === "string" ? f.answer : ""),
              },
            })),
          })}
        </script>
      </Helmet>

      <main className="min-h-[100dvh] bg-background text-foreground overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-12">
          {/* Back button - hidden on mobile overlay where a close button already exists */}
          {!hideBackButton && (
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors mb-8"
            >
              <ArrowLeft className="size-3.5" />
              Back to Command Deck
            </button>
          )}

          {/* Header */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-primary/30 bg-primary/10 text-primary rounded-sm mb-5">
              <HelpCircle className="size-3" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Knowledge Base</span>
            </div>
            <h1 className="font-mono text-3xl md:text-4xl font-bold tracking-tight text-card-foreground mb-3">
              Frequently Asked Questions
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
               Answers about weather data, community reports, local conditions, and your StormCircle account.
            </p>
          </div>

          {/* Support / donation block */}
          <div className="glass-panel border-primary/40 p-6 mb-8">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-primary/30 bg-primary/10 text-primary rounded-sm mb-4">
              <Heart className="size-3" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Support the Project</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              Would you like to support the development of StormCircle, keeping it accessible and free for everybody
              without ads or sponsors?
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {PRESET_AMOUNTS.map((amount) => (
                <a
                  key={amount}
                  href={`${PAYPAL_BASE}/${amount}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 border border-primary/40 bg-primary/10 text-primary font-mono text-sm font-bold rounded-sm hover:bg-primary/20 hover:border-primary transition-all"
                >
                  ${amount}
                </a>
              ))}
              <div className="flex items-stretch">
                <input
                  type="text"
                  inputMode="decimal"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") window.open(customHref, "_blank", "noopener,noreferrer");
                  }}
                  placeholder="Custom"
                  aria-label="Custom amount in USD"
                  className="w-24 px-3 py-2.5 bg-card border border-primary/40 rounded-l-sm text-sm font-mono text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
                <a
                  href={customHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 border border-l-0 border-primary/40 bg-primary/10 text-primary font-mono text-sm font-bold rounded-r-sm hover:bg-primary/20 hover:border-primary transition-all"
                >
                  →
                </a>
              </div>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-3">
              Secure donation via PayPal · amounts in USD
            </p>
          </div>

          {/* FAQ list */}
          <div className="space-y-2.5">
            {faqs.map((faq, i) => {
              const open = openIndex === i;
              return (
                <div
                  key={i}
                  className={`glass-panel overflow-hidden transition-colors ${
                    open ? "border-primary/50" : "hover:border-primary/30"
                  }`}
                >
                  <button
                    onClick={() => toggle(i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-sm md:text-[0.95rem] font-medium text-card-foreground">{faq.question}</span>
                    <span
                      className={`shrink-0 size-7 rounded-full border border-primary/40 flex items-center justify-center text-primary transition-transform duration-300 ${
                        open ? "rotate-45 bg-primary/15" : ""
                      }`}
                    >
                      <Plus className="size-3.5" />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                      >
                        <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.answer}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center border-t border-border pt-10">
            <p className="text-sm text-muted-foreground mb-5">
              Still have questions? Join the StormCircle community and ask away.
            </p>
            <button
              onClick={() => navigate("/auth")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-mono text-[11px] font-bold uppercase tracking-wider rounded-sm hover:brightness-110 transition-all neon-glow-amber"
            >
              Join StormCircle Free →
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
