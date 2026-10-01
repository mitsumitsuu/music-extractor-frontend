// ブラウザ保存（localStorage）。プライベートモード等で失敗しても動くように全て try/catch。
import { DEFAULT_FILTERS, DEFAULT_LINKS, type ApiKeys, type Preset, type Song } from "./types";

const K = {
  presets: "mx:presets:v2",
  active: "mx:active:v2",
  keys: "mx:keys:v2",
  prefs: "mx:prefs:v2",
  history: "mx:history:v2",
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
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

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

/** 古い形式・壊れたデータでも安全に Preset にする */
export function sanitizePreset(p: Partial<Preset> & Record<string, unknown>): Preset {
  const base = createPreset(typeof p.name === "string" && p.name ? p.name.slice(0, 40) : "読み込んだプリセット");
  const modeMap: Record<string, Preset["mode"]> = { fast: "fast", ai: "ai", stats: "stats" };
  const m = String(p.mode ?? "");
  if (m.includes("AI")) p.mode = "ai";
  else if (m.includes("統計")) p.mode = "stats";
  else if (m.includes("高速")) p.mode = "fast";
  // 旧バージョン（v1）のフラットな項目を新形式へ移行
  if (!p.filters && ("minV" in p || "excludeWords" in p)) {
    const n = (v: unknown) => (typeof v === "number" ? v : "") as number | "";
    p.filters = {
      ...DEFAULT_FILTERS,
      minViews: n(p.minV), maxViews: n(p.maxV), minComments: n(p.minC), maxComments: n(p.maxC),
      excludeWords: String(p.excludeWords ?? ""), vocal: String(p.targetVocal ?? ""), producer: String(p.targetProducer ?? ""),
      bpm: n(p.targetBpm), key: String(p.targetKey ?? ""), theme: String(p.theme ?? ""),
      multiOnly: !!p.multiOnly, requireMmd: !!p.requireMmd,
    };
    p.links = { lyrics: p.addLyrics !== false, analysis: !!p.addAnalysis, tunebat: p.addBpm !== false };
  }
  return {
    ...base,
    useUrl: !!p.useUrl,
    usePaste: !!p.usePaste,
    useFile: !!p.useFile,
    url: typeof p.url === "string" ? p.url : "",
    pastedText: typeof p.pastedText === "string" ? p.pastedText : "",
    mode: modeMap[String(p.mode)] ?? "fast",
    provider: p.provider === "gemini" || p.provider === "openai" ? p.provider : "auto",
    filters: { ...DEFAULT_FILTERS, ...(typeof p.filters === "object" && p.filters ? p.filters : {}) },
    links: { ...DEFAULT_LINKS, ...(typeof p.links === "object" && p.links ? p.links : {}) },
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
    const ok = Array.isArray(arr) ? arr.map((p) => ({ ...sanitizePreset(p as Preset & Record<string, unknown>), id: p.id || newId() })) : [];
    return ok.length ? ok : [createPreset("プリセット 1")];
  },
  savePresets: (p: Preset[]) => write(K.presets, p),
  loadActive: () => read<string>(K.active, ""),
  saveActive: (id: string) => write(K.active, id),
  loadPrefs: (): Prefs => ({ ...DEFAULT_PREFS, ...read<Partial<Prefs>>(K.prefs, {}) }),
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
