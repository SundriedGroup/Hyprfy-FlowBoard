import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyprfy Flowboard",
  description: "Plan work, content and real life around each day.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
