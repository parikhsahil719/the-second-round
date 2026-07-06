import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API } from "@/lib/api";

export const metadata = { title: "Methodology — The Second Round" };

export default async function Methodology() {
  const res = await fetch(`${API}/memo`, { cache: "no-store" });
  const md = res.ok ? await res.text() : "# Methodology\n\nMemo unavailable.";

  return (
    <article className="memo mx-auto max-w-3xl">
      <Markdown remarkPlugins={[remarkGfm]}>{md}</Markdown>
      <style>{`
        .memo h1 { font-family: var(--font-serif), Georgia, serif; font-size: 1.9rem; line-height: 1.3; margin: 2rem 0 1rem; }
        .memo h2 { font-family: var(--font-serif), Georgia, serif; font-size: 1.3rem; margin: 2rem 0 0.6rem; }
        .memo p, .memo li { font-size: 0.925rem; line-height: 1.75; color: var(--text); margin: 0.6rem 0; }
        .memo strong { color: var(--purple); font-weight: 600; }
        .memo table { border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
        .memo th, .memo td { border: 1px solid var(--border); padding: 6px 12px; text-align: left; }
        .memo th { color: var(--muted); font-weight: 500; }
        .memo hr { border-color: var(--border); margin: 2rem 0; }
        .memo em { color: var(--muted); }
        .memo a { text-decoration: underline; }
      `}</style>
    </article>
  );
}
