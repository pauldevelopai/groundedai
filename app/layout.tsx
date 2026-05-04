export const metadata = {
  title: 'Anchor',
  description: 'Newsroom AI platform — GROUNDED, Develop AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
