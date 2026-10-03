import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Trackwise", description: "Time tracking and task management with WhatsApp and Telegram" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
