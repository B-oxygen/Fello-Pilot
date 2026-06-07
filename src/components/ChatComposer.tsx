"use client";

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

export function ChatComposer({
  busy,
  onSend,
  value,
  onChange,
}: {
  busy: boolean;
  onSend: (text: string) => Promise<void> | void;
  value: string;
  onChange: (next: string) => void;
}) {
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || busy || submitting) return;
    setSubmitting(true);
    try {
      await onSend(trimmed);
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    if (composingRef.current || nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        data-testid="chat-composer-textarea"
        placeholder="자연어 crypto intent를 입력하세요. 예: Sepolia에서 1 USDC를 ETH로 swap"
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        rows={2}
      />
      <button
        type="button"
        data-testid="chat-composer-submit"
        onClick={() => void submit()}
        disabled={busy || submitting || value.trim().length === 0}
      >
        {busy || submitting ? "..." : "보내기"}
      </button>
    </div>
  );
}
