export const metadata = {
  title: 'MVP-1',
  description: 'Minimal Next.js 14 App Router app for Vercel',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
