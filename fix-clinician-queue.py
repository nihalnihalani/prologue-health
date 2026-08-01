import re

with open("app/clinician/page.tsx", "r") as f:
    content = f.read()

queue_code = """          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {queue
              .filter(q => {
                if (queueFilter === "review") return q.state === "ready_for_review" || q.state === "under_review";
                if (queueFilter === "mine") return q.state === "under_review"; // For simplicity
                if (queueFilter === "completed") return q.state === "signed";
                return true;
              })
              .map((q) => (
              <div 
                key={q.id} 
                onClick={() => setSessionId(q.id)}
                style={{ 
                  padding: 10, borderRadius: 6, 
                  border: sessionId === q.id ? "1px solid var(--action)" : "1px solid var(--line)", 
                  background: "var(--surface)", 
                  cursor: "pointer" 
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: 13, color: "var(--ink)" }}>{q.patient}</strong>
                  <span className={`chip ${q.state === 'signed' ? 'live' : 'sim'}`} style={{ fontSize: 9, padding: "2px 6px" }}>{q.state}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-secondary)", marginTop: 4 }}>Items: {q.itemCount}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-muted)", marginTop: 8 }}>
                  <span>{q.locale}</span>
                </div>
              </div>
            ))}
          </div>"""

# Find the div that starts with `<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>`
# and ends right before `</motion.div>` for column 1
pattern = r'<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>.*?</div>\s*</motion\.div>'

content = re.sub(pattern, queue_code + '\n        </motion.div>', content, flags=re.DOTALL)

with open("app/clinician/page.tsx", "w") as f:
    f.write(content)
