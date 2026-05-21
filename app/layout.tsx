import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Raleway } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/trpc/client";
import { TogetherApiKeyProvider } from "@/components/TogetherApiKeyProvider";
import { Footer } from "@/components/Footer";

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Whisper App - Capture Your Thoughts By Voice",
  description: "Convert your thoughts into text by voice with Whisper.",
  openGraph: {
    images: "https://usewhisper.io/og.jpg",
  },
  manifest: "/site.webmanifest",
  icons: {
    apple: "/icons/512.png",
  },
  appleWebApp: {
    capable: true,
    title: "Whisper",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Use client-side navigation for login/signup
  // This must be a Client Component to use useRouter, so we can use a workaround:
  // Place a ClientHeader component below
  return (
    <ClerkProvider>
      <TogetherApiKeyProvider>
        <TRPCReactProvider>
          <html lang="en">
            <head>
              {/* TODO: update Plausible setup for next-plausible v4.
                  Either pass src="https://plausible.io/js/pa-XXXX.js" to <PlausibleProvider />,
                  or switch to withPlausibleProxy() in next.config.ts */}
            </head>
            <body className={`${raleway.variable} antialiased`}>
              <div className="min-h-screen bg-white flex flex-col">
                <Header />
                {children}
                <Toaster richColors />
                <Footer />
              </div>
            </body>
          </html>
        </TRPCReactProvider>
      </TogetherApiKeyProvider>
    </ClerkProvider>
  );
}
