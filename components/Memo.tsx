"use client";

import { memo, type ReactNode } from "react";

/**
 * deps が変わらない間は children を呼び直さず、前回の描画結果をそのまま使う。
 * 数百行の一覧で「1行のチェック」「検索欄・入力欄の1文字入力」のたびに全行を作り直さないために使う。
 * 描画結果が deps だけで決まる場合にのみ使うこと（children の中で deps に無い値を読むと古い表示になる）。
 */
export const Memo = memo(
  function Memo({ children }: { deps: readonly unknown[]; children: () => ReactNode }) {
    return <>{children()}</>;
  },
  (a, b) => a.deps.length === b.deps.length && a.deps.every((d, i) => Object.is(d, b.deps[i])),
);
