import type { Metadata, Viewport } from "next";
import { Inconsolata } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";

const inconsolata = Inconsolata({
  subsets: ["latin"],
  variable: "--font-inconsolata",
  display: "swap",
});
import { GlobalHooks } from "@/components/providers/global-hooks";
import { VaultUnlockDialog } from "@/components/providers/vault-unlock-dialog";
import { Toaster as SonnerToaster } from "sonner";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { InstallPrompt, UpdatePrompt } from "@/components/pwa";
import { ErrorBoundary } from "@/components/error-boundary";
import { DbInitOverlay } from "@/components/db/db-init-overlay";
import { MigrationBanner } from "@/components/migration-banner";
import { LuminaFloatingNotifications } from "@/components/lumina-floating-notifications";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumina - AI Chat Workstation",
  description: "Premium LLM chat frontend with model control, context management, and agentic tools",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lumina",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Synchronous cache clear - runs BEFORE React hydrates to prevent crashes from stale state */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var VERSION = '2.1.0';
                  var stored = localStorage.getItem('lumina-app-version');
                  if (stored !== VERSION) {
                    console.log('[Boot] Version mismatch, clearing caches...');
                    var keysToRemove = [];
                    for (var i = 0; i < localStorage.length; i++) {
                      var key = localStorage.key(i);
                      if (key && (key.includes('streaming') || key.includes('zustand') || key === 'streaming-store-state')) {
                        keysToRemove.push(key);
                      }
                    }
                    keysToRemove.forEach(function(key) {
                      localStorage.removeItem(key);
                    });
                    localStorage.setItem('lumina-app-version', VERSION);
                    console.log('[Boot] Cleared ' + keysToRemove.length + ' keys');
                  }
                } catch (e) {
                  console.error('[Boot] Cache clear failed:', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inconsolata.variable} font-sans antialiased`}>
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <GlobalHooks />
            <VaultUnlockDialog />
            <MigrationBanner />
            {children}
            <CommandPalette />
            <MobileNav />
            <InstallPrompt />
            <UpdatePrompt />
            <DbInitOverlay />
            <LuminaFloatingNotifications />
            <SonnerToaster richColors closeButton />
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
