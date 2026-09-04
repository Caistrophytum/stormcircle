/**
 * FAQ.tsx - Frequently Asked Questions page.
 * Matches the site's Avionics Command Deck aesthetic: dark obsidian bg,
 * neon amber primary, JetBrains Mono for labels/headings, Inter for body.
 * Uses collapsible accordion items so each answer stays compact.
 */
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, HelpCircle } from "lucide-react";
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
      "StormCircle is a forever-free, indie, solo-developed weather social network where anyone, from curious members of the public to professional meteorologists, can share real-time storm reports, follow severe weather events, and stay informed during active weather situations. It combines a tactical weather map, automated weather bots, a personal Weather Risk Score, an Outdoor Exercise Comfort index, and community chat into one browser-based command deck.",
  },
  {
    question: "Who is StormCircle for?",
    answer:
      "StormCircle is built for everyone. Whether you're a professional meteorologist sharing a verified severe weather warning, a storm enthusiast tracking a supercell, an athlete deciding if it's safe to run or bike, or an everyday person wanting to know if that dark cloud is something to worry about - StormCircle connects you with the right information at the right time.",
  },
  {
    question: "Who are you, Mr. developer?",
    answer:
      "Hi! Nice to meet you. First, let me extend my sincerest thanks for visiting my website. My name's Omri, at the time of writing this paragraph and developing the website (2026) I'm 18 years old. I've been a weather enthusiast since infancy, and since then I've been collecting measurement instruments, studying models and taking online university courses. This website is my little love project for the community. If you'd like to contact me further, feel free to browse for AspiringMolecularEngineer on Tumblr or on email at stormcirclecontact@gmail.com.",
  },
  {
    question: "How do I report severe weather on StormCircle?",
    answer:
      "Simply create a free account, log in, and post your storm report to the live community feed. Describe what you're observing: wind, hail, flooding, rotation, strong winds, heat-related events, or active wildfire. Your report becomes instantly visible to other users and meteorologists monitoring the platform. Meteorologists can verify reports so the community knows which posts are trusted.",
  },
  {
    question: "Is StormCircle free to use?",
    answer:
      "Yes. StormCircle is completely free to join and use. Create an account and start participating in real-time weather communication right away.",
  },
  {
    question: "How is StormCircle different from other weather apps?",
    answer:
      "Most weather apps give you forecasts. StormCircle gives you a community command deck. It bridges professional meteorologists and the general public in a shared, real-time space, combining social networking with live severe weather data, NEXRAD radar overlays, SPC and Fire Weather outlooks, European MeteoAlarm warnings, an Outdoor Exercise Comfort model, browser push notifications, and a personal Weather Risk Score.",
  },
  {
    question: "Can meteorologists use StormCircle professionally?",
    answer:
      "Absolutely. StormCircle features a verified Meteorologist badge for credentialed professionals. Meteorologists can use the platform to share situational awareness updates, communicate warnings directly to the public, verify citizen storm reports as ground-truth data during active weather events, and apply for the badge through the Account Center.",
  },
  {
    question: "What severe weather data does StormCircle show?",
    answer:
      "StormCircle integrates live NEXRAD radar, U.S. NWS severe weather alerts and Local Storm Reports, SPC convective outlooks, Fire Weather outlooks, hurricane and ENSO briefings, and European severe weather warnings and radar information via MeteoAlarm. All data is displayed on an interactive tactical map so you can see the full weather picture at a glance.",
  },
  {
    question: "Does StormCircle cover weather outside the USA?",
    answer:
      "Yes. StormCircle now supports global hometowns and city search through Open-Meteo geocoding, shows European severe weather warnings and radar products via MeteoAlarm, NEXRAD U.S radar information and uses Open-Meteo weather data worldwide.",
  },
  {
    question: "Where can I find real-time storm reports near me?",
    answer:
      "StormCircle's live map and chat feed show community storm reports, official warnings, and radar data all in one place. You can monitor your local area, switch the danger-panel filter to Local or International, or zoom out to track regional severe weather events as they develop in real time.",
  },
  {
    question: "What is the Weather Risk Score?",
    answer:
      "The Weather Risk Score is a 0-100 index that blends surface humidity, mid-level humidity, mid-level lapse rate, CAPE, bulk shear, LCL, EL, and CIN into a single convective-severity readout. It updates on a shared refresh cycle and is shown on both desktop and mobile.",
  },
  {
    question: "What is Outdoor Exercise Comfort?",
    answer:
      "Outdoor Exercise Comfort calculates how comfortable and safe it is to walk, run, bike, or hike right now. It scores each activity from 0 to 100 using real-feel temperature, wind, UV index, air quality, and rain, and shows which parameter is limiting you most. It also projects the next six hours so you can plan your workout.",
  },
  {
    question: "Can I get notifications from StormCircle?",
    answer:
      "Yes. You can enable push and in-app notifications in the Account Center for hometown weather alerts, WRS changes, SPC Enhanced or greater outlooks, Fire Weather updates, and chat messages. Chat notifications can be set to ALL posts or only LOCAL posts within about 150 km of you.",
  },
  {
    question: "How do I get started on StormCircle?",
    answer:
      "Visit StormCircle.net, create a free account, and you're in. No app download required: StormCircle runs entirely in your browser. Join the community, follow active weather discussions, set your hometown, and start contributing reports from your area.",
  },
  {
    question: "Is there a StormCircle Zello channel?",
    answer: (
      <>
        Yes — you can join the StormCircle channel on Zello for live voice storm spotting and community coordination during active weather. Visit{" "}
        <a
          href="https://Zello.com/stormcirclezello"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
        >
          Zello.com/stormcirclezello
        </a>{" "}
        to join.
      </>
    ),
    jsonAnswer:
      "Yes — you can join the StormCircle channel on Zello for live voice storm spotting and community coordination during active weather. Visit https://Zello.com/stormcirclezello to join.",
  },
];

export default function FAQ({ hideBackButton = false }: { hideBackButton?: boolean } = {}) {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <>
      <Helmet>
        <title>FAQ - StormCircle Weather Social Network</title>
        <meta
          name="description"
          content="Answers to common questions about StormCircle: what it is, who it's for, how to report storms, and how meteorologists use the platform."
        />
        <link rel="canonical" href="https://stormcircle.net/faq" />
        <meta property="og:title" content="StormCircle FAQ - Your Questions Answered" />
        <meta
          property="og:description"
          content="Everything you need to know about StormCircle, the real-time weather social network."
        />
        <meta property="og:url" content="https://stormcircle.net/faq" />
        <meta property="og:type" content="website" />
        {/* FAQPage structured data - enables rich results in Google search. */}
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
              Everything you need to know about StormCircle - the weather social network connecting meteorologists and
              the public in real time.
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
                        <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
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
