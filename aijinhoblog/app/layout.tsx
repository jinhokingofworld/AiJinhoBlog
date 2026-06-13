import type { Metadata } from "next";
import DesktopAccountBar from "@/frontend/components/desktop-account-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AiJinhoBlog",
  description: "개인 블로그와 AI 기능을 결합한 지식 기반 블로그",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <DesktopAccountBar />
        {children}
      </body>
    </html>
  );
}
