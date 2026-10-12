import { sha256 } from "./util";

/** 法人番号公表サイト由来の法人一覧（houjin.jp の検索結果ページ）から1社ずつ取り出した記録 */
export interface RegistryEntity {
  corporateNumber: string;
  name: string;
  address: string;
  eventDate: string | null;
  event: string;
  url: string;
  contentHash: string;
}

const BLOCK = /\[法人番号：(\d{13})(\d{4}\/\d{2}\/\d{2})?に?([^\n]*)\n+##\s*([^\n]+)\n+([^\n]+)[\s\S]*?\]\((https:\/\/houjin\.jp\/c\/\d{13})\)/g;

export function parseHoujinSearch(markdown: string): RegistryEntity[] {
  const out = new Map<string, RegistryEntity>();
  for (const m of markdown.matchAll(BLOCK)) {
    const [, corporateNumber, date, event, name, address, url] = m;
    const e = { corporateNumber, name: name.trim(), address: address.trim(), eventDate: date ? date.replace(/\//g, "-") : null, event: event.trim(), url };
    out.set(corporateNumber, { ...e, contentHash: sha256(`${e.name}\t${e.address}\t${e.eventDate}\t${e.event}`) });
  }
  return [...out.values()];
}

const norm = (t: string) => t.normalize("NFKC").toLowerCase().replace(/[\s・.,]/g, "");

/** 社名に対象企業の名前・別名が含まれる法人だけ残す。除外語に当たる法人は落とす（残った同名の別会社の判定は Jev と人の確認に回す） */
export function matchesCompany(e: RegistryEntity, names: string[], exclude: string[] = []): boolean {
  const n = norm(e.name);
  if (exclude.some((x) => x && n.includes(norm(x)))) return false;
  return names.some((x) => x && n.includes(norm(x)));
}

export function diffEntities(prev: RegistryEntity[], next: RegistryEntity[]) {
  const before = new Map(prev.map((e) => [e.corporateNumber, e]));
  const added = next.filter((e) => !before.has(e.corporateNumber));
  const changed = next.filter((e) => before.has(e.corporateNumber) && before.get(e.corporateNumber)!.contentHash !== e.contentHash);
  return { added, changed };
}

/** houjin.jp の「該当なし」の結果ページか（全0件）。読めないページと区別する */
export function isEmptyHoujinResult(markdown: string): boolean {
  return /全\s*0\s*件/.test(markdown);
}
