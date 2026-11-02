"use client";

import Image from "next/image";
import { useMemo, useState, type CSSProperties } from "react";
import type { CalendarDate } from "@/lib/dates";
import { selectDecorations, type Decoration } from "@/lib/decorations";
import { useDiarySession } from "./DiarySession";
import styles from "./DiaryPaper.module.css";

function Illustration({ decoration: { asset, corner, sizePercent, rotation } }: { decoration: Decoration }) {
  const [failed, setFailed] = useState(false);
  return <div className={`${styles.sticker} ${styles[corner]}`} data-asset-id={asset.id} data-corner={corner} data-failed={failed || undefined}
    style={{ "--art-size": `${sizePercent}%`, "--art-rotation": `${rotation}deg`, visibility: failed ? "hidden" : undefined } as CSSProperties}>
    <Image src={asset.path} width={asset.width} height={asset.height} alt="" draggable={false} unoptimized decoding="async"
      loading={corner === "topLeft" || corner === "bottomRight" ? "eager" : "lazy"} onError={() => setFailed(true)} />
  </div>;
}
export function DecorationLayer({ date }: { date: CalendarDate }) {
  const { decorationScope, theme } = useDiarySession();
  const arrangement = useMemo(() => selectDecorations({ ownerScope: decorationScope, date, theme }), [decorationScope, date, theme]);
  return <div className={styles.decorations} aria-hidden="true" data-artwork="launch-v1" data-arrangement-version="1"
    data-arrangement={JSON.stringify(arrangement.map(({ asset, corner, sizePercent, rotation }) => ({ assetId: asset.id, corner, sizePercent, rotation })))}>
    {arrangement.map(decoration => <Illustration key={`${decoration.corner}:${decoration.asset.id}`} decoration={decoration} />)}
  </div>;
}
