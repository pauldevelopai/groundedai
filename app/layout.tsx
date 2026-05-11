export const metadata = {
  title: 'Grounded',
  description: 'Newsroom AI platform — Develop AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
