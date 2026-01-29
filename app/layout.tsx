import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast/toast-context";

export const metadata: Metadata = {
  title: "Moil Partners - Business License Management",
  description: "Moil's official partner dashboard for business license management and white-label activation",
  icons: {
    icon: "/moil-logo.png",
    apple: "/moil-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/interstate" />
      </head>
      <body
        className="antialiased"
        style={{ fontFamily: "'Interstate', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif" }}
      >
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
