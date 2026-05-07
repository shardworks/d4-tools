import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/app/globals.css";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { HeaderBar } from "@/components/layout/HeaderBar";
import { CommandPaletteStub } from "@/components/layout/CommandPaletteStub";
import { SoftGate } from "@/components/layout/SoftGate";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "D4 Tools",
  description: "Diablo 4 build analysis tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <SoftGate />
        <div className="flex h-screen overflow-hidden">
          <SidebarNav />
          <div className="flex flex-col flex-1 min-w-0">
            <HeaderBar />
            <main className="flex-1 overflow-auto p-4">{children}</main>
          </div>
        </div>
        <CommandPaletteStub />
      </body>
    </html>
  );
}
