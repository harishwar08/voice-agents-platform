import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";

import { DemoCard, type Demo } from "@/components/marketing/DemoCard";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Telugu Voice Agents",
  description:
    "Voice agents that answer and place phone calls in Telugu and every other Indian language, and reply in under a second.",
};

const CONTACT = "hello@teluguvoiceagents.ai";

const DEMOS: Demo[] = [
  {
    category: "Real Estate",
    title: "AI Voice Agent for Real Estate",
    description:
      "Understands buyer requirements, recommends properties, and schedules site visits — all in one natural conversation.",
    gradient: "linear-gradient(150deg, oklch(0.82 0.16 58), oklch(0.72 0.18 38))",
    src: "/audio/real-estate.mp3",
  },
  {
    category: "Mobile Store",
    title: "AI Voice Agent for Mobile store",
    description:
      "Finds the right products, checks compatibility, and guides customers all the way to purchase.",
    gradient: "linear-gradient(150deg, oklch(0.85 0.09 250), oklch(0.74 0.12 285))",
    src: "/audio/mobile-store.mp3",
  },
  {
    category: "Retail",
    title: "Kirana order on the phone",
    description:
      "Inbound. The agent takes a spoken grocery list with quantities, repeats the total and confirms the delivery slot.",
    gradient: "linear-gradient(150deg, oklch(0.86 0.11 145), oklch(0.74 0.12 165))",
  },
];

const FAQS = [
  {
    q: "Which dialects does it handle?",
    a: "Telangana and coastal Andhra speech, plus Telugu mixed with English and Hindi words, and regional accents in the other languages we support. Rayalaseema is in testing.",
  },
  {
    q: "How does it connect to our numbers?",
    a: "Over SIP or a standard telephony provider. Existing IVR numbers keep working — the agent sits behind them.",
  },
  {
    q: "What happens when it cannot help?",
    a: "It transfers to your team with a short summary of the call, or records a callback request outside working hours.",
  },
  {
    q: "Where do recordings and transcripts live?",
    a: "In Indian regions, with consent flags on every call. Retention windows are set per deployment.",
  },
  {
    q: "How long does a deployment take?",
    a: "A scripted use case runs in two weeks. Agents grounded in your own catalogue or records take four to six.",
  },
  {
    q: "Do you support other languages?",
    a: "Yes. Telugu is where our coverage is deepest, and the same agents run in Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali and English, including calls that switch mid-sentence.",
  },
];

export default function HomePage() {
  return (
    <div
      className={`${inter.className} min-h-screen overflow-x-hidden bg-[oklch(0.99_0.004_85)] text-[oklch(0.2_0.012_60)]`}
    >
      <div className="relative bg-[radial-gradient(120%_90%_at_50%_-18%,oklch(0.72_0.19_48)_0%,oklch(0.84_0.15_62)_34%,oklch(0.95_0.05_78)_62%,oklch(0.99_0.004_85)_82%)] px-6">
        <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-6 py-[22px]">
          <div className="text-lg font-bold tracking-[-0.02em] text-[oklch(0.18_0.01_60)]">
            Telugu Voice Agents
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium text-[oklch(0.26_0.012_60)] sm:gap-[26px]">
            <a href="#demos" className="hidden sm:inline hover:underline">
              Demos
            </a>
            <a href="#faq" className="hidden sm:inline hover:underline">
              FAQ
            </a>
            <Link href="/login" className="hover:underline">
              Log in
            </Link>
            <a
              href={`mailto:${CONTACT}`}
              className="rounded-full bg-[oklch(0.18_0.01_60)] px-[18px] py-[9px] font-medium text-[oklch(0.99_0.004_85)]"
            >
              Contact us
            </a>
          </nav>
        </header>

        <section className="mx-auto max-w-[900px] pb-24 pt-[76px] text-center">
          <div className="mb-7 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/25 bg-[oklch(0.32_0.06_50/0.5)] px-4 py-[7px] text-xs font-medium uppercase tracking-[0.06em] text-[oklch(0.99_0.004_85)]">
            Voice AI for Indian languages
          </div>
          <h1 className="mx-auto mb-[22px] max-w-[22ch] text-balance text-[clamp(38px,6vw,68px)] font-semibold leading-[1.02] tracking-[-0.035em] text-[oklch(0.16_0.012_60)]">
            Voice agents that speak the way your callers do
          </h1>
          <p className="mx-auto mb-9 max-w-[46ch] text-lg leading-[1.55] text-[oklch(0.32_0.014_60)]">
            Voice agents that answer and place phone calls in Telugu and every other
            Indian language, and reply in under a second.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="#demos"
              className="shrink-0 whitespace-nowrap rounded-full bg-[oklch(0.18_0.01_60)] px-[26px] py-[13px] text-[15px] font-medium text-[oklch(0.99_0.004_85)]"
            >
              Hear the demos
            </a>
            <a
              href={`mailto:${CONTACT}`}
              className="shrink-0 whitespace-nowrap rounded-full border border-[oklch(0.88_0.01_75)] bg-white px-[26px] py-[13px] text-[15px] font-medium text-[oklch(0.2_0.012_60)]"
            >
              Talk to us
            </a>
          </div>
          <div className="mt-[34px] text-[15px] text-[oklch(0.38_0.02_55)]">
            మీ కస్టమర్ భాషలో మాట్లాడే వాయిస్ ఏజెంట్లు
          </div>
        </section>
      </div>

      <section id="demos" className="mx-auto max-w-[1120px] px-6 pb-[100px]">
        <div className="mx-auto mb-11 max-w-[620px] text-center">
          <h2 className="text-[clamp(28px,3.6vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            Three calls, recorded as they happened
          </h2>
          <p className="mt-3.5 text-[16.5px] leading-[1.55] text-[oklch(0.42_0.014_60)]">
            Unedited audio from live deployments. Press play to listen.
          </p>
        </div>

        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {DEMOS.map((demo) => (
            <DemoCard key={demo.title} demo={demo} />
          ))}
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-[1120px] px-6 pb-[100px]">
        <div className="rounded-3xl border border-[oklch(0.91_0.01_75)] bg-white p-[clamp(28px,5vw,56px)]">
          <h2 className="text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            Questions we get asked
          </h2>
          <p className="mb-3 mt-2 text-base text-[oklch(0.46_0.014_60)]">
            Anything else, write to{" "}
            <a
              href={`mailto:${CONTACT}`}
              className="text-[oklch(0.55_0.16_45)] underline underline-offset-2"
            >
              {CONTACT}
            </a>
            .
          </p>

          <div className="flex flex-col">
            {FAQS.map((faq) => (
              // <details> keeps the accordion working without client-side JS.
              <details key={faq.q} className="group border-t border-[oklch(0.92_0.01_75)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-[22px] text-[17px] font-medium tracking-[-0.01em] text-[oklch(0.18_0.012_60)] [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="shrink-0 text-[22px] font-normal leading-none text-[oklch(0.55_0.015_60)] group-open:hidden">
                    +
                  </span>
                  <span className="hidden shrink-0 text-[22px] font-normal leading-none text-[oklch(0.55_0.015_60)] group-open:block">
                    −
                  </span>
                </summary>
                <p className="-mt-1.5 mb-6 max-w-[72ch] text-[15.5px] leading-[1.65] text-[oklch(0.42_0.012_60)]">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[oklch(0.92_0.01_75)] px-6">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-baseline justify-between gap-5 pb-12 pt-7 text-[13.5px] text-[oklch(0.5_0.015_60)]">
          <span className="text-base font-bold tracking-[-0.02em] text-[oklch(0.2_0.012_60)]">
            Telugu Voice Agents
          </span>
          <span>teluguvoiceagents.ai — Hyderabad</span>
          <a href={`mailto:${CONTACT}`} className="hover:underline">
            {CONTACT}
          </a>
        </div>
      </footer>
    </div>
  );
}
