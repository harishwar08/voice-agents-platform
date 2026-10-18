import type { Metadata } from "next";
import { Manrope, Source_Serif_4 } from "next/font/google";

import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "AI Employee Platform",
  description:
    "Managed AI employees for Indian businesses — Business Brain facts, trainer-managed behaviour.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      {/* Extensions inject attributes into body before hydration; suppression is one level deep only */}
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}
