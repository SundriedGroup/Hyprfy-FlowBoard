import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Hyprfy Flowboard",
  description: "Plan the day. Create the story.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
