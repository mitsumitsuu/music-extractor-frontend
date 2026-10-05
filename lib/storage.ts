// ブラウザ保存（localStorage）。プライベートモード等で失敗しても動くように全て try/catch。
import { asMode, asProvider, sanitizeFilters, sanitizeLinks } from "./sanitize";
import { DEFAULT_FILTERS, DEFAULT_LINKS, type ApiKeys, type Preset, type Song } from "./types";

const K = {
  presets: "mx:presets:v2",
  active: "mx:active:v2",
  keys: "mx:keys:v2",
  prefs: "mx:prefs:v2",
  history: "mx:history:v2",
  setlists: "mx:setlists:v1",
  performed: "mx:performed:v1",
};

export type Prefs = {
  theme: "system" | "light" | "dark";
  confirmDelete: boolean;
  confirmReset: boolean;
  rememberKeys: boolean;
  passcode: string;
};

export type HistoryEntry = { id: string; at: number; presetName: string; count: number; songs: Song[] };

export const DEFAULT_PREFS: Prefs = { theme: "system", confirmDelete: true, confirmReset: true, rememberKeys: false, passcode: "" };

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** 初めて使う人に最初から用意するタブ（プリセット）の数 */
export const INITIAL_PRESETS = 3;

/** 名前以外が初期状態のままのプリセットか（タブ数の移行判定用） */
const isPristine = (p: Preset) => !p.url && !p.pastedText && p.mode === "fast" && /^プリセット \d+$/.test(p.name);

export function createPreset(name: string): Preset {
  return {
    id: newId(),
    name,
    useUrl: true,
    usePaste: false,
    useFile: false,
    url: "",
    pastedText: "",
    mode: "fast",
    provider: "auto",
    filters: { ...DEFAULT_FILTERS },
    links: { ...DEFAULT_LINKS },
    filename: "playlist",
  };
}

/** 古い形式・壊れたデータでも安全に Preset にする（共有リンク・バックアップ由来のデータも通す） */
export function sanitizePreset(p: Partial<Preset> & Record<string, unknown>): Preset {
  const base = createPreset(typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 40) : "読み込んだプリセット");
  const m = String(p.mode ?? "");
  const mode = m.includes("AI") ? "ai" : m.includes("統計") ? "stats" : m.includes("高速") ? "fast" : asMode(p.mode);
  let filters: unknown = p.filters;
  let links: unknown = p.links;
  // 旧バージョン（v1）のフラットな項目を新形式へ移行
  if (!filters && ("minV" in p || "excludeWords" in p)) {
    const n = (v: unknown) => (typeof v === "number" ? v : "");
    filters = {
      ...DEFAULT_FILTERS,
      minViews: n(p.minV), maxViews: n(p.maxV), minComments: n(p.minC), maxComments: n(p.maxC),
      excludeWords: String(p.excludeWords ?? ""), vocal: String(p.targetVocal ?? ""), producer: String(p.targetProducer ?? ""),
      bpm: n(p.targetBpm), key: String(p.targetKey ?? ""), theme: String(p.theme ?? ""),
      multiOnly: !!p.multiOnly, requireMmd: !!p.requireMmd,
    };
    links = { lyrics: p.addLyrics !== false, analysis: !!p.addAnalysis, tunebat: p.addBpm !== false };
  }
  return {
    ...base,
    useUrl: !!p.useUrl,
    usePaste: !!p.usePaste,
    useFile: !!p.useFile,
    url: typeof p.url === "string" ? p.url.slice(0, 20_000) : "",
    pastedText: typeof p.pastedText === "string" ? p.pastedText.slice(0, 300_000) : "",
    mode,
    provider: asProvider(p.provider),
    filters: filters ? sanitizeFilters(filters) : { ...DEFAULT_FILTERS },
    links: links ? sanitizeLinks(links) : { ...DEFAULT_LINKS },
    filename: typeof p.filename === "string" && p.filename ? p.filename.slice(0, 60) : "playlist",
  };
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 容量不足・プライベートモード */
  }
}

export const store = {
  loadPresets(): Preset[] {
    const arr = read<Preset[]>(K.presets, []);
    const ok = Array.isArray(arr) ? arr.map((p) => ({ ...sanitizePreset(p as Preset & Record<string, unknown>), id: typeof p.id === "string" && p.id ? p.id.slice(0, 40) : newId() })) : [];
    // 初回、または未使用のプリセットが1つだけの場合は、最初からタブを3つ用意する
    if (ok.length === 0 || (ok.length === 1 && isPristine(ok[0]))) {
      for (let i = ok.length; i < INITIAL_PRESETS; i++) ok.push(createPreset(`プリセット ${i + 1}`));
    }
    return ok;
  },
  savePresets: (p: Preset[]) => write(K.presets, p),
  loadActive: () => read<string>(K.active, ""),
  saveActive: (id: string) => write(K.active, id),
  loadPrefs: (): Prefs => {
    const p = read<Partial<Prefs>>(K.prefs, {});
    return {
      theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system",
      confirmDelete: typeof p.confirmDelete === "boolean" ? p.confirmDelete : DEFAULT_PREFS.confirmDelete,
      confirmReset: typeof p.confirmReset === "boolean" ? p.confirmReset : DEFAULT_PREFS.confirmReset,
      rememberKeys: p.rememberKeys === true,
      passcode: typeof p.passcode === "string" ? p.passcode.slice(0, 200) : "",
    };
  },
  savePrefs: (p: Prefs) => write(K.prefs, p),
  loadKeys: () => read<ApiKeys>(K.keys, {}),
  saveKeys: (k: ApiKeys | null) => {
    if (!k) {
      try { window.localStorage.removeItem(K.keys); } catch { /* ignore */ }
      return;
    }
    write(K.keys, k);
  },
  loadHistory: () => read<HistoryEntry[]>(K.history, []),
  saveHistory: (h: HistoryEntry[]) => write(K.history, h.slice(0, 20)),
  /** セトリ（検証は lib/setlist.ts の sanitizeSetlist で行う） */
  loadSetlistsRaw: (): unknown[] => { const v = read<unknown>(K.setlists, []); return Array.isArray(v) ? v : []; },
  saveSetlists: (list: unknown[]) => write(K.setlists, list),
  /** 演奏済みリスト（貼り付けた生テキスト） */
  loadPerformed: (): string => { const v = read<unknown>(K.performed, ""); return typeof v === "string" ? v : ""; },
  savePerformed: (text: string) => write(K.performed, text),
};

/** プリセット共有用：APIキーなど秘密情報は含めない */
export function encodePresetForShare(p: Preset): string {
  const { id: _id, ...rest } = p;
  void _id;
  const json = JSON.stringify(rest);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSharedPreset(s: string): Preset | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    let json = new TextDecoder().decode(bytes);
    // 旧形式（encodeURIComponent → btoa）にも対応
    if (json.startsWith("%7B")) json = decodeURIComponent(json);
    const obj = JSON.parse(json) as Record<string, unknown>;
    delete obj.ytKey;
    delete obj.geminiKey;
    return sanitizePreset(obj as Partial<Preset> & Record<string, unknown>);
  } catch {
    return null;
  }
}
