"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { User, Stethoscope, ArrowRight, ShieldCheck, Clock } from "lucide-react";

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

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <motion.div 
        style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} style={{ marginBottom: 24 }}>
          <div className="chip sim" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
            <ShieldCheck size={14} />
            Synthetic patient — not real PHI
          </div>
          <h1 style={{ fontSize: 42, letterSpacing: "-.04em", margin: "0 0 12px 0", fontWeight: 700, lineHeight: 1.1 }}>
            Prologue
          </h1>
          <p style={{ fontSize: 20, color: "var(--ink)", marginTop: 0, fontWeight: 500, letterSpacing: "-.01em" }}>
            The visit starts before the visit.
          </p>
          <p style={{ fontSize: 16, color: "var(--ink-2)", maxWidth: 520, lineHeight: 1.6, marginTop: 12 }}>
            A voice intake that has already read your chart, so it catches what you didn&rsquo;t know to mention. Save time and improve accuracy with our intelligent AI intake.
          </p>
        </motion.div>

        <motion.div variants={itemVariants} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 32 }}>
          <Link href="/patient" style={{ textDecoration: "none" }}>
            <motion.div 
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="card" 
              style={{ height: "100%", padding: 24, display: "flex", flexDirection: "column", background: "var(--surface)" }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-2)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <User size={20} />
              </div>
              <h2 style={{ fontSize: 18, margin: "0 0 8px 0", fontWeight: 600, color: "var(--ink)" }}>Patient Check-in</h2>
              <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0, flex: 1, marginBottom: 20 }}>
                Experience the intelligent voice intake from the patient's perspective.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent)", fontSize: 14, fontWeight: 600, marginTop: "auto" }}>
                Start intake <ArrowRight size={16} />
              </div>
            </motion.div>
          </Link>

          <Link href="/clinician" style={{ textDecoration: "none" }}>
            <motion.div 
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="card" 
              style={{ height: "100%", padding: 24, display: "flex", flexDirection: "column", background: "var(--surface)" }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-2)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Stethoscope size={20} />
              </div>
              <h2 style={{ fontSize: 18, margin: "0 0 8px 0", fontWeight: 600, color: "var(--ink)" }}>Clinician Review</h2>
              <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0, flex: 1, marginBottom: 20 }}>
                Review the AI-generated brief, medication reconciliation, and flags.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink)", fontSize: 14, fontWeight: 600, marginTop: "auto" }}>
                View dashboard <ArrowRight size={16} />
              </div>
            </motion.div>
          </Link>
        </motion.div>
        
        <motion.div variants={itemVariants} style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 8, color: "var(--ink-3)", fontSize: 13, justifyContent: "center" }}>
          <Clock size={14} />
          <span>Average intake time: &lt; 3 minutes</span>
        </motion.div>
      </motion.div>
    </main>
  );
}
