import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";
import { FlashToast } from "@/components/ui/flash-toast";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale/userScalable lock — pinch-zoom must stay available
  // (WCAG 1.4.4 Resize Text); field crews zoom into photos/specs on phones.
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export const metadata: Metadata = {
  title: "Construction OS",
  description: "Enterprise multi-tenant construction management platform for simple, vertical, and heavy civil operations.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Construction OS",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('bcon-theme')||'dark';document.documentElement.setAttribute('data-theme',t);var s=localStorage.getItem('bcon-sunlight')==='true';if(s)document.documentElement.setAttribute('data-sunlight','true');}catch(e){}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Suspense fallback={null}>
          <FlashToast />
        </Suspense>
      </body>
    </html>
  );
}
