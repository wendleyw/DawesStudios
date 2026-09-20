import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/features/shared/forms.css";
import "@xyflow/react/dist/style.css";
import { ApplicationProviders } from "@/features/auth/auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Creative Canvas — Brianna Dawes Studios",
  description: "Your projects, feedback, and brand. One considered space to move things forward.",
  icons: {
    icon: "/brand/logo.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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
