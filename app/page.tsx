import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "60px 20px" }}>
      <h1 style={{ fontSize: 34, letterSpacing: "-.03em", margin: 0 }}>Prologue</h1>
      <p style={{ fontSize: 18, color: "var(--ink-2)", marginTop: 6 }}>The visit starts before the visit.</p>
      <p style={{ fontSize: 15.5, color: "var(--ink-2)", maxWidth: 520 }}>
        A voice intake that has already read your chart, so it catches what you didn&rsquo;t know to mention.
      </p>
      <div className="chip sim" style={{ display: "inline-block", margin: "6px 0 22px" }}>
        Synthetic patient — not real PHI
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/patient" className="btn primary big" style={{ textDecoration: "none" }}>Patient check-in →</Link>
        <Link href="/clinician" className="btn big" style={{ textDecoration: "none" }}>Clinician review →</Link>
      </div>
    </main>
  );
}
