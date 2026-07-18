import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

const themeInitScript = `(function(){try{var t=localStorage.getItem("gg:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export const metadata: Metadata = {
  title: "GameGuide Guru",
  description: "Find your way out when your adventure gets stuck.",
  applicationName: "GameGuide Guru",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GameGuide Guru",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f0e7" },
    { media: "(prefers-color-scheme: dark)", color: "#14181a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
