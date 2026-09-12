import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  icons: { icon: "/credibleexec.svg" },
  title: "CredibleExec — A promise with a stake",
  description:
    "Financial commitments backed by agent collateral and settled against verified onchain outcomes.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
