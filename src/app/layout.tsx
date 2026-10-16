import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
import "./globals.css";
import Link from "next/link";
import { getMode } from "@/lib/mode";

export const metadata = { title: "Japan GTM Radar" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = getMode();
  return (
    <html lang="ja">
      <body>
        <header>
          <b>Japan GTM Radar</b>
          <Link href="/">Readout / ヨミ表</Link>
          <Link href="/feed">Update feed / 更新フィード</Link>
          <Link href="/monitor">Monitoring & review / 監視・確認</Link>
          <Link href="/decode">Decode Japan / 日本を読み解く</Link>
          <span className={`mode ${mode}`}>{mode === "live" ? "LIVE · Nimble + Jev" : "DEMO · sample data"}</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
