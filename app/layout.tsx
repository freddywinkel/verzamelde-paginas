import type { Metadata, Viewport } from "next";
import "@fontsource/caveat/latin-500.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/fraunces/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/newsreader/latin-400.css";
import "@fontsource/newsreader/latin-400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Verzamelde pagina’s",
  title: {
    default: "Verzamelde pagina’s",
    template: "%s · Verzamelde pagina’s",
  },
  description: "Een privé, offline archief voor gedichten, versies en eigen stemopnames.",
  openGraph: {
    type: "website",
    locale: "nl_NL",
    title: "Verzamelde pagina’s",
    description: "Een privé, offline archief voor gedichten, versies en eigen stemopnames.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Verzamelde pagina’s op een warme schrijftafel" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Verzamelde pagina’s",
    description: "Een privé, offline archief voor gedichten, versies en eigen stemopnames.",
    images: ["/og.jpg"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pagina’s",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e8ddcb",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
