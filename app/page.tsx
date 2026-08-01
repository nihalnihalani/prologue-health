"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { 
  User, Stethoscope, ArrowRight, ShieldCheck, Clock, FileText, 
  Settings, AlertTriangle, ShieldAlert, BadgeCheck
} from "lucide-react";
import { Timeline } from "@/components/StoryMap";

export default function Home() {
  const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 20 },
    },
  };

  // Preview model of Maria's timeline for the hero panel on the homepage
  const mariaTimelineModel = {
    days: 40,
    todayDay: 22,
    meds: [
      {
        name: "lamotrigine",
        startDay: 4, // 22 days ago, rash onset day 18 (started 22 - 18 = 4 days into therapy)
        ongoing: true,
        riskWindow: { fromDay: 14, toDay: 56, label: "SJS risk window (2-8 weeks)" },
        emphasis: true,
      },
      {
        name: "divalproex sodium",
        startDay: -20,
        ongoing: true,
      }
    ],
    events: [
      { day: 18, label: "symptom onset", critical: true }
    ]
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", background: "var(--bg)" }}>
      <motion.div 
        style={{ maxWidth: 1100, width: "100%", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))", gap: 48 }}
        variants={containerVariants}
        initial={false}
        animate="visible"
      >
        {/* Left Column: Editorial Content & CTAs */}
        <motion.div variants={itemVariants} style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div className="chip live" style={{ alignSelf: "flex-start", marginBottom: 16 }}>
            <ShieldCheck size={14} />
            Synthetic demonstration · no real PHI
          </div>

          <h1 style={{ fontFamily: "var(--serif)", fontSize: 44, fontWeight: 650, letterSpacing: "-.03em", margin: "0 0 16px 0", color: "var(--ink)", lineHeight: 1.15 }}>
            Maria’s Thursday visit shouldn’t wait.
          </h1>

          <p style={{ fontSize: 18, color: "var(--ink-2)", margin: "0 0 24px 0", lineHeight: 1.5, fontFamily: "var(--sans)" }}>
            A voice intake that has already read your chart, so it catches what you didn&rsquo;t know to mention. Save critical clinic minutes while improving patient safety.
          </p>

          {/* Core Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
            <Link href="/patient" style={{ textDecoration: "none" }}>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn primary big" 
                style={{ width: "100%", justifyContent: "space-between", padding: "14px 22px" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <User size={18} />
                  Start synthetic intake
                </span>
                <ArrowRight size={18} />
              </motion.button>
            </Link>

            <Link href="/prove" style={{ textDecoration: "none" }}>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn big" 
                style={{ width: "100%", justifyContent: "space-between", padding: "14px 22px" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldAlert size={18} className="muted" />
                  Challenge the engine
                </span>
                <ChevronRightIcon />
              </motion.button>
            </Link>
          </div>

          {/* Tertiary Text Link */}
          <div style={{ marginTop: 24 }}>
            <Link href="/clinician" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              Open clinician review queue <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>

        {/* Right Column: Hero Visual Evidence Spine Preview */}
        <motion.div variants={itemVariants} className="card" style={{ display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--line)" }}>
          <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px" }}>
            <BadgeCheck size={18} className="src-PATIENT" />
            <h2>Interactive Evidence Chain (Maria)</h2>
            <span className="chip sim" style={{ marginInlineStart: "auto" }}>fixture</span>
          </header>

          <div style={{ padding: "20px 18px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div className="mono" style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--provenance-patient-bg)", color: "var(--provenance-patient-fg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>1</div>
                <div>
                  <div style={{ fontSize: 13.5, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "var(--sans)" }}>Patient mentions rash</div>
                  <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--ink)" }}>&ldquo;I started getting a rash on my chest 4 days ago.&rdquo;</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div className="mono" style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--provenance-record-bg)", color: "var(--provenance-record-fg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>2</div>
                <div>
                  <div style={{ fontSize: 13.5, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "var(--sans)" }}>Chart reveals recent prescription</div>
                  <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--ink)" }}>Lamotrigine started 22 days ago.</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", borderBottom: "1px solid var(--line-soft)", paddingBottom: 16 }}>
                <div className="mono" style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--provenance-inference-bg)", color: "var(--provenance-inference-fg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>3</div>
                <div>
                  <div style={{ fontSize: 13.5, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "var(--sans)" }}>Deterministic safety trigger</div>
                  <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--ink)" }}>Symptom began 18 days into therapy, matching the critical SJS risk window.</p>
                </div>
              </div>
            </div>

            {/* Production Timeline Visual */}
            <div style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r)", padding: "10px 0", background: "var(--surface-sunken)" }}>
              <Timeline model={mariaTimelineModel} audience="patient" />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}

// Compact helper arrow component
function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="muted">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
