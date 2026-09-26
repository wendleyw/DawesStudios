import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "@/features/shared/forms.css";
import "@xyflow/react/dist/style.css";
import { ApplicationProviders } from "@/features/auth/auth-provider";
import { fontScript } from "@/features/workspace/font";
import { themeScript } from "@/features/workspace/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The Editorial pairing (`features/workspace/font.ts`). Not preloaded: most visitors keep Geist.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Brianna Dawes Studios",
  description: "Your projects, feedback, and brand. One considered space to move things forward.",
  icons: {
    icon: "/brand/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The head scripts set `data-theme` and `data-font` before hydration, so this element differs from the server's.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: fontScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${inter.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <ApplicationProviders
          configuration={{
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
            supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            mediaUrl: process.env.NEXT_PUBLIC_MEDIA_URL ?? "",
          }}
        >
          {children}
        </ApplicationProviders>
      </body>
    </html>
  );
}
