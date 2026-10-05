// 共通の型定義（フロント・API の両方で使用）

export type Mode = "fast" | "ai" | "stats";
export type Provider = "auto" | "gemini" | "openai";

export type Filters = {
  minViews: number | "";
  maxViews: number | ""; // 空 or 0 で無制限
  minComments: number | "";
  maxComments: number | "";
  excludeWords: string;
  vocal: string;
  producer: string;
  bpm: number | "";
  key: string;
  theme: string;
  multiOnly: boolean;
  requireMmd: boolean;
};

export type LinkOptions = {
  lyrics: boolean;
  analysis: boolean;
  tunebat: boolean;
};

export type Preset = {
  id: string;
  name: string;
  useUrl: boolean;
  usePaste: boolean;
  useFile: boolean;
  url: string;
  pastedText: string;
  mode: Mode;
  provider: Provider;
  filters: Filters;
  links: LinkOptions;
  filename: string;
};

export type UploadFile = {
  name: string;
  mime: string;
  /** base64（PDF/画像のみ。CSV/Excel はブラウザ側でテキスト化して送る） */
  data?: string;
  /** CSV/Excel をテキスト化したもの */
  text?: string;
  size: number;
};

export type ApiKeys = {
  youtube?: string;
  gemini?: string;
  openai?: string;
};

export type ExtractRequest = {
  urls: string[];
  text: string;
  files: UploadFile[];
  mode: Mode;
  provider: Provider;
  filters: Filters;
  links: LinkOptions;
  keys?: ApiKeys;
};

export type Song = {
  id: string;
  title: string;
  producer?: string;
  vocal?: string;
  bpm?: number;
  key?: string;
  mmd?: "あり" | "なし" | "不明";
  url?: string;
  views?: number;
  comments?: number;
  publishedAt?: string;
  source?: string;
  links: {
    youtube: string;
    lyrics?: string;
    analysis?: string;
    tunebat?: string;
  };
};

export type ExtractResponse = {
  songs: Song[];
  warnings: string[];
  meta: {
    mode: Mode;
    provider?: string;
    model?: string;
    candidates: number;
    elapsedMs: number;
  };
};

export type HealthResponse = {
  /** この利用者がサーバー側のキーを使えるか */
  youtube: boolean;
  gemini: boolean;
  openai: boolean;
  passcodeRequired: boolean;
  contact: boolean;
  auth: {
    /** Google ログインが設定済みか */
    enabled: boolean;
    /** 抽出・お問い合わせにログインが必要か */
    required: boolean;
    user: { email: string; name: string } | null;
  };
};

export const DEFAULT_FILTERS: Filters = {
  minViews: "",
  maxViews: "",
  minComments: "",
  maxComments: "",
  excludeWords: "",
  vocal: "",
  producer: "",
  bpm: "",
  key: "",
  theme: "",
  multiOnly: false,
  requireMmd: false,
};

export const DEFAULT_LINKS: LinkOptions = { lyrics: true, analysis: false, tunebat: true };
