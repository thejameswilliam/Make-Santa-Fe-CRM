import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Make Santa Fe CRM",
  description: "Internal CRM"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
