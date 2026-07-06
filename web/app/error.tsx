"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="serif text-2xl">The data engine is catching its breath</h1>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        The stats server runs on a free tier and naps after 15 quiet minutes. The first
        visit can take up to a minute to wake it. Give it a moment and try again.
      </p>
      <button className="btn mt-5 text-sm" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
