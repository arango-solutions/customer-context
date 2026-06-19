import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Inter — body + UI (UI-SPEC Typography: exactly two weights, 400 / 600).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// JetBrains Mono — all AQL / _id / collection / traversal code (the "show the
// query" thesis; UI-SPEC Brand/Theming).
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Customer 360',
  description:
    'Graph-grounded Customer 360 — every answer traced to the record, graph, and query it came from.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
