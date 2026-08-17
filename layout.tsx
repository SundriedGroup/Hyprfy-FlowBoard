import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Hyprfy Flowboard",
  description: "A date-first planning board for Hyprfy LifeOS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
