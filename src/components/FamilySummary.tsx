import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props { password: string; memberCount: number }

export default function FamilySummary({ password, memberCount }: Props) {
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);

  const generate = async (accessRestored = false) => {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setSummary("");
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/family-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ password, accessRestored }), signal: abort.signal,
      });
      if (!response.ok) {
        const payload = await response.json();
        setBlocked(Boolean(payload.blocked));
        throw new Error(payload.message || "Unable to generate summary.");
      }
      setBlocked(false);
      if (!response.body) throw new Error("AI returned no summary.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);
          if (chunk.message) throw new Error(chunk.message);
          if (chunk.text) { text += chunk.text; setSummary(text); }
        }
        if (done) break;
      }
      if (!text.trim()) throw new Error("AI returned no summary.");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") setError("Summary stopped.");
      else setError(err instanceof Error ? err.message : "Unable to generate summary.");
      setSummary("");
    } finally { setBusy(false); controller.current = undefined; }
  };

  return (
    <section className="grid gap-4 py-2" aria-label="Family summary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-primary" /> Family summary</h3>
        {busy ? (
          <Button variant="outline" size="sm" onClick={() => controller.current?.abort()}><Square className="mr-2 h-3 w-3" /> Stop</Button>
        ) : (
          <Button size="sm" disabled={!memberCount || blocked} onClick={() => generate()}>
            {summary ? <RefreshCw className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {summary ? "Refresh summary" : "Generate summary"}
          </Button>
        )}
      </div>
      {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Generating summary…</p>}
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {blocked && <Button variant="outline" size="sm" disabled={busy} onClick={() => generate(true)}>Access restored — resume</Button>}
      {!memberCount && <p className="text-sm text-muted-foreground">No family members yet.</p>}
      {summary && <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground" aria-live={busy ? "off" : "polite"}>{summary}</div>}
    </section>
  );
}