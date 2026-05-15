/**
 * FAQ.tsx — Frequently Asked Questions page.
 * Matches the site's Avionics Command Deck aesthetic: dark obsidian bg,
 * neon amber primary, JetBrains Mono for labels/headings, Inter for body.
 * Uses collapsible accordion items so each answer stays compact.
 */
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "What is StormCircle?",
    answer:
      "StormCircle is a free weather social network where anyone — from curious members of the public to professional meteorologists — can share real-time storm reports, follow severe weather events, and stay informed during active weather situations across the USA.",
  },
  {
    question: "Who is StormCircle for?",
    answer:
      "StormCircle is built for everyone. Whether you're a professional meteorologist sharing a verified severe weather warning, a storm enthusiast tracking a supercell, or an everyday person wanting to know if that dark cloud is something to worry about — StormCircle connects you with the right information at the right time.",
  },
  {
    question: "How do I report severe weather on StormCircle?",
    answer:
      "Simply create a free account, log in, and post your storm report to the live community feed. Describe what you're observing — wind, hail, flooding, rotation — and your report becomes instantly visible to other users and meteorologists monitoring the platform.",
  },
  {
    question: "Is StormCircle free to use?",
    answer:
      "Yes. StormCircle is completely free to join and use. Create an account and start participating in real-time weather communication right away.",
  },
  {
    question: "How is StormCircle different from other weather apps?",
    answer:
      "Most weather apps give you forecasts. StormCircle gives you a community. It's the only platform designed specifically to bridge professional meteorologists and the general public in a shared, real-time space — combining social networking with live severe weather data, NEXRAD radar overlays, and SPC outlook information.",
  },
  {
    question: "Can meteorologists use StormCircle professionally?",
    answer:
      "Absolutely. StormCircle features a verified Meteorologist badge for credentialed professionals. Meteorologists can use the platform to share situational awareness updates, communicate warnings directly to the public, and monitor citizen storm reports as ground-truth data during active weather events.",
  },
  {
    question: "What severe weather data does StormCircle show?",
    answer:
      "StormCircle integrates live NEXRAD radar, NWS severe weather alerts, SPC Day 1 convective outlooks, and real-time Local Storm Reports (LSRs). All data is displayed on an interactive map so you can see the full weather picture at a glance.",
  },
  {
    question: "Does StormCircle cover weather outside the USA?",
    answer:
      "StormCircle currently focuses on the United States, where our severe weather data integrations — including NEXRAD radar and NWS alerts — provide the most comprehensive coverage. International expansion is on our roadmap.",
  },
  {
    question: "Where can I find real-time storm reports near me?",
    answer:
      "StormCircle's live map shows community storm reports, NWS warnings, and radar data all in one place. You can monitor your local area or zoom out to track regional severe weather events as they develop in real time.",
  },
  {
    question: "How do I get started on StormCircle?",
    answer:
      "Visit StormCircle.net, create a free account, and you're in. No app download required — StormCircle runs entirely in your browser. Join the community, follow active weather discussions, and start contributing reports from your area.",
  },
];

export default function FAQ() {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <>
      <Helmet>
        <title>FAQ — StormCircle Weather Social Network</title>
        <meta
          name="description"
          content="Answers to common questions about StormCircle: what it is, who it's for, how to report storms, and how meteorologists use the platform."
        />
        <meta property="og:title" content="StormCircle FAQ — Your Questions Answered" />
        <meta
          property="og:description"
          content="Everything you need to know about StormCircle, the real-time weather social network."
        />
        <meta property="og:url" content="https://stormcircle.net/faq" />
        <meta property="og:type" content="website" />
      </Helmet>

      <main className="min-h-[100dvh] bg-background text-foreground overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-12">
          {/* Back button */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors mb-8"
          >
            <ArrowLeft className="size-3.5" />
            Back to Command Deck
          </button>

          {/* Header */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-primary/30 bg-primary/10 text-primary rounded-sm mb-5">
              <HelpCircle className="size-3" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                Knowledge Base
              </span>
            </div>
            <h1 className="font-mono text-3xl md:text-4xl font-bold tracking-tight text-card-foreground mb-3">
              Frequently Asked Questions
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              Everything you need to know about StormCircle — the weather social
              network connecting meteorologists and the public in real time.
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
                    <span className="text-sm md:text-[0.95rem] font-medium text-card-foreground">
                      {faq.question}
                    </span>
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
                        <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                          {faq.answer}
                        </p>
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
