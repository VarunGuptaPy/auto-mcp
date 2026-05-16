"use client";

import { useEffect, useRef } from "react";
import type { SSEEvent } from "./types";

export function useSSE(
  url: string | null,
  onEvent: (event: SSEEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!url) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      es = new EventSource(url!);

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as SSEEvent;
          onEventRef.current(parsed);
        } catch {
          // malformed frame — skip
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!stopped) {
          retryTimer = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [url]);
}
