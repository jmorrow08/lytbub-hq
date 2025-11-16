import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lytbub HQ v0.1",
  description: "Personal control dashboard for tracking Tasks, Revenue, Content, and Health",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
