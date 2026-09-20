import type { Metadata } from "next";
import "./globals.css";
import "./ui/forest/forest.css";

export const metadata: Metadata = {
  title: "SylvaSense — The Last Green",
  description:
    "From the living forest to a different kind of vision. An immersive journey through forest intelligence, and the future we can still protect.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
