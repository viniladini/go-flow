import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { ImportSessionProvider } from "@/components/import-session-provider";
import { getOperationalDemo } from "@/lib/operations/service";
import { APPEARANCE_INIT_SCRIPT } from "@/lib/theme/appearance";
import { Presentation } from "@/components/presentation";
import { PRESENTATION_INIT_SCRIPT } from "@/lib/presentation";
import "./globals.css";
import "./signature-motion.css";
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
export const metadata: Metadata = {
  title: { default: "Visão geral | go.flow", template: "%s | go.flow" },
  description: "go.flow: inteligência de estoque e compras. Protótipo independente desenvolvido para o Desafio AI-First GoGroup. From insight to action.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable}`}><head><script id="goflow-appearance-init" dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} /><script id="goflow-presentation-init" dangerouslySetInnerHTML={{ __html: PRESENTATION_INIT_SCRIPT }} /></head><body><ImportSessionProvider initialDemo={getOperationalDemo()}><Presentation><AppShell>{children}</AppShell></Presentation></ImportSessionProvider></body></html>;
}
