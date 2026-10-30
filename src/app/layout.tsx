import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/providers';

export const metadata: Metadata = {
  title: 'FoodBridge – Rescue Food. Reduce Waste. Feed Communities.',
  description:
    'FoodBridge is a zero-waste food rescue coordination platform connecting food donors with nearby NGOs through geolocation-based matching, coordinating volunteer pickups and deliveries.',
  keywords: ['food rescue', 'zero waste', 'food donation', 'NGO', 'volunteer', 'food bridge'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
