import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BitcoinWorld Publisher — Publishing Desk",
  description: "Your X posts, delivered to Telegram. A local publishing dashboard with a background worker.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
