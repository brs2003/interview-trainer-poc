import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Interview Trainer | AI Voice Simulator & Interviewer Evaluator',
  description: 'Train human interviewers by practicing on an AI-simulated job candidate and receiving structured evaluator scoring.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-cream text-olive min-h-screen flex flex-col selection:bg-terracotta/30 selection:text-olive antialiased font-sans print:bg-white">
        {children}
      </body>
    </html>
  );
}
