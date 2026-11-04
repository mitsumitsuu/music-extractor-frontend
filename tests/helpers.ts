import type { Song } from "@/lib/types";

/** テスト用の最小の Song */
export const song = (title: string, extra: Partial<Song> = {}): Song => ({ id: "", title, links: { youtube: "" }, ...extra });
