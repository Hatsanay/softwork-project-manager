import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

const kanit = localFont({
  src: "../font/Kanit-Regular.ttf",
  variable: "--font-kanit",
});

export const metadata: Metadata = {
  title: "Softwork Project Manager",
  description: "Project status tracking for clients and team",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${kanit.variable} h-full antialiased overflow-x-hidden`}>
      <body className={`${kanit.className} min-h-full flex flex-col overflow-x-hidden`}>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
