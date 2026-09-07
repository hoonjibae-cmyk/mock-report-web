"use client";

import { useEffect } from "react";

/**
 * 화면에 들어온 순간 판독 서버를 미리 깨운다.
 *
 * 작은 요금제의 판독 서버는 15분 놀면 잠들고, 깨우는 데 1분쯤 걸린다. 사람은
 * 접속하자마자 답안지를 뽑지 않는다 — 시험을 고르고 설정을 확인하고 인쇄 매수를
 * 세는 시간이 있다. 그 시간에 서버를 깨워 두면, 정작 버튼을 누를 때는 기다림이
 * 없다.
 *
 * 결과는 쓰지 않는다. 실패해도 화면에 아무 표시를 하지 않는 것이 맞다 —
 * 사용자가 시킨 일이 아니고, 정작 필요한 순간에는 다시 부르기 때문이다.
 */
export function useOmrWarmup(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/admin/omr/warmup", { signal: controller.signal }).catch(() => {
      // 깨우기 실패는 조용히 넘긴다
    });
    return () => controller.abort();
  }, [enabled]);
}
