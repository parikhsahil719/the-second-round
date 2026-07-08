export const metadata = { title: "Privacy | The Second Round" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-prose text-sm leading-relaxed" style={{ color: "var(--text)" }}>
      <h1 className="serif text-2xl">Privacy</h1>
      <p className="mt-4" style={{ color: "var(--muted)" }}>
        The Second Round is a free, independent research project. Here is everything it
        stores, in plain language.
      </p>
      <ul className="mt-4 list-disc space-y-3 pl-5" style={{ color: "var(--muted)" }}>
        <li>
          <span style={{ color: "var(--text)" }}>Without an account:</span> nothing. Notes
          you type are processed to compute an update and immediately discarded. They are
          never written to disk or logs. Rate limiting counts requests per IP for one day.
        </li>
        <li>
          <span style={{ color: "var(--text)" }}>With an account:</span> your email address
          (for the magic-link sign-in) and the scout notes you explicitly save. Notes are
          private to your account and never shared, analyzed for other users, or sold.
        </li>
        <li>
          <span style={{ color: "var(--text)" }}>API keys:</span> a &quot;bring your own
          key&quot; value is used for that single request and never stored.
        </li>
        <li>
          <span style={{ color: "var(--text)" }}>Third parties:</span> live note extraction
          sends your note text (nothing else) to Anthropic&apos;s API. Accounts and saved
          notes are hosted on Supabase. Player photos load from ESPN&apos;s CDN. No
          advertising or analytics trackers.
        </li>
        <li>
          <span style={{ color: "var(--text)" }}>Delete everything:</span> delete individual
          notes anytime in the app; for full account deletion, email the address in the
          footer and it will be removed within a week.
        </li>
      </ul>
    </article>
  );
}
