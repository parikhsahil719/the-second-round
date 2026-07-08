import { GLOSSARY, GLOSSARY_CATEGORIES } from "@/lib/glossary";

export const metadata = { title: "Glossary | The Second Round" };

export default function Glossary() {
  return (
    <article className="mx-auto max-w-prose">
      <h1 className="serif text-4xl">Glossary</h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--muted)" }}>
        Every term the board, war room, and player pages use, in plain English. Anywhere on the
        site, hover or tap an underlined word to see its definition without leaving the page.
      </p>

      {GLOSSARY_CATEGORIES.map((cat) => {
        const entries = Object.entries(GLOSSARY).filter(([, e]) => e.category === cat);
        return (
          <section key={cat} className="mt-8">
            <h2 className="serif text-3xl" style={{ color: "var(--purple-bright)" }}>
              {cat}
            </h2>
            <dl className="mt-2 space-y-3">
              {entries.map(([id, e]) => (
                <div key={id} id={id} className="scroll-mt-24">
                  <dt className="text-base font-semibold" style={{ color: "var(--text)" }}>
                    {e.term}
                  </dt>
                  <dd
                    className="mt-0.5 text-base leading-relaxed"
                    style={{ color: "var(--muted)" }}
                  >
                    {e.short}
                    {e.long ? ` ${e.long}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </article>
  );
}
