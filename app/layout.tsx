import type { Metadata } from "next";
import { Suspense } from "react";

import "@/app/globals.css";
import { NavigationLoadingBar } from "@/app/components/navigation-loading-bar";

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
      <body>
        <Suspense fallback={null}>
          <NavigationLoadingBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
