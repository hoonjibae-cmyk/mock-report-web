"use client";

import { useEffect, useState } from "react";

/**
 * 주관식 답안 칸의 손글씨 원본.
 *
 * 전사한 글자 옆에 나란히 띄운다. 잘못 읽은 것이 있으면 눈으로 바로 확인되고,
 * 그 자리에서 고칠 수 있어야 채점을 믿을 수 있다.
 */
export default function EssayCrop({
  scanId,
  questionNo,
}: {
  scanId: string;
  questionNo: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError("");
    fetch(`/api/admin/omr/scans/${scanId}/essay/${questionNo}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setError(data.error || "이미지를 불러오지 못했습니다.");
        else setUrl(data.url);
      })
      .catch(() => alive && setError("이미지를 불러오지 못했습니다."));
    return () => {
      alive = false;
    };
  }, [scanId, questionNo]);

  if (error) return <p className="essay-crop-empty">{error}</p>;
  if (!url) return <div className="essay-crop-loading" />;
  return (
    // 답안 이미지는 서명 주소로만 열리고 10분 뒤 만료된다
    // eslint-disable-next-line @next/next/no-img-element
    <img className="essay-crop" src={url} alt={`${questionNo}번 손글씨 답안`} />
  );
}
