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
      {/* Sets theme before first paint to prevent flash */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('msf-crm-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);return;}var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){}})();`
          }}
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <NavigationLoadingBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
