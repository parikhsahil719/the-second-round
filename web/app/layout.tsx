import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { LensProvider, LensToggle } from "@/lib/lens";
import AccountLink from "@/components/AccountLink";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "The Second Round — NBA draft intelligence",
  description:
    "Fair-value tier probabilities for the 2026 NBA draft class, priced against the market — plus a scout-notes layer that updates the numbers with what you saw.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} antialiased`}>
      <body>
        <LensProvider>
          <header className="border-b" style={{ borderColor: "var(--border)" }}>
            <div className="mx-auto max-w-5xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-5">
                <Link href="/" className="serif text-xl">
                  The Second Round
                </Link>
                <nav className="flex gap-4 text-xs" style={{ color: "var(--muted)" }}>
                  <Link href="/">Board</Link>
                  <Link href="/war-room">War room</Link>
                  <Link href="/methodology">Methodology</Link>
                </nav>
              </div>
              <div className="flex items-center gap-3">
                <LensToggle />
                <AccountLink />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
          <footer
            className="mx-auto max-w-5xl px-5 py-8 mt-8 text-xs border-t leading-relaxed"
            style={{ color: "var(--faint)", borderColor: "var(--border)" }}
          >
            Built by Sahil Parikh —{" "}
            <a href="https://YOUR_LINK_HERE" className="underline">
              portfolio
            </a>
            . Free public data (Barttorvik, Basketball-Reference, nba_api); ordinal
            regression, leave-one-class-out calibrated, 2009–2021 training classes. Out of
            sample the market beats the model on average — trust it where it disagrees
            loudly. <Link href="/privacy" className="underline">Privacy</Link>
          </footer>
        </LensProvider>
      </body>
    </html>
  );
}
