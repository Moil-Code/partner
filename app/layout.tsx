import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast/toast-context";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { SWRProvider } from "@/lib/providers/SWRProvider";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/interstate" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('moil-theme');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else if (theme === 'light') {
                    document.documentElement.classList.add('light');
                  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.add('light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className="antialiased"
        style={{ fontFamily: "'Interstate', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif" }}
      >
        <SWRProvider>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
