import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { LensProvider, LensToggle } from "@/lib/lens";
import AccountLink from "@/components/AccountLink";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "The Second Round | NBA draft intelligence",
  description:
    "Fair-value tier probabilities for the 2026 NBA draft class, priced against the market, plus a scout-notes layer that updates the numbers with what you saw.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} antialiased`}>
      <body>
        <LensProvider>
          <header className="border-b" style={{ borderColor: "var(--border)" }}>
            <div className="mx-auto max-w-5xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-6">
                <Link href="/" className="serif text-2xl font-semibold">
                  The Second Round
                </Link>
                <nav className="flex gap-5 text-sm">
                  <Link href="/" className="nav-link">Board</Link>
                  <Link href="/war-room" className="nav-link">War room</Link>
                  <Link href="/methodology" className="nav-link">How it works</Link>
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
            Built by Sahil Parikh (
            <a href="https://www.linkedin.com/in/sahilparikh719/" className="link">
              LinkedIn
            </a>
            ). Free public data: Barttorvik, Basketball-Reference, nba_api. Tested against
            every draft from 2009 to 2021. On the average pick the market beats the model.
            Trust it where it disagrees loudly.{" "}
            <Link href="/privacy" className="link">Privacy</Link>
          </footer>
        </LensProvider>
      </body>
    </html>
  );
}
