import re

with open("app/clinician/page.tsx", "r") as f:
    content = f.read()

# Add queue state
if "const [queue, setQueue]" not in content:
    content = content.replace(
        "const [map, setMap] = useState<StoryMap | null>(null);",
        "const [map, setMap] = useState<StoryMap | null>(null);\n  const [queue, setQueue] = useState<any[]>([]);"
    )

# Replace load function
new_load = """const load = useCallback(async () => {
    try {
      const qRes = await fetch("/api/session?queue=1");
      if (qRes.ok) {
        const qj = await qRes.json();
        setQueue(qj.sessions || []);
      }
      
      const fetchUrl = sessionId ? `/api/session?id=${sessionId}` : "/api/session";
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const j = (await res.json()) as {
          map: StoryMap | null;
          mode?: string;
          session?: { id: string; state: string };
        };
        if (j.map) {
          setMap(j.map);
          setSessionId(j.session?.id ?? j.map.sessionId);
          setState(j.session?.state ?? null);
          if (j.mode) setMode(j.mode);
          setSource("server");
          return;
        }
      }
    } catch { /* fall through */ }
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const m = JSON.parse(raw) as StoryMap;
        setMap(m);
        setSessionId(m.sessionId);
        setSource("local");
      }
    } catch { /* ignore */ }
  }, [sessionId]);"""

content = re.sub(r'const load = useCallback\(async \(\) => \{.*?\}, \[\]\);', new_load, content, flags=re.DOTALL)

with open("app/clinician/page.tsx", "w") as f:
    f.write(content)
