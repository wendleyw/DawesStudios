"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/features/shared/modal";

export function CopyButton({
  text,
  label = "Copy",
  className = "button quiet",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setManualCopy(true);
    }
  }
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => void copy()}
        onBlur={() => setCopied(false)}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : label}
      </button>
      <span className="visually-hidden" role="status">
        {copied ? "Copied to clipboard." : ""}
      </span>
      <Modal
        open={manualCopy}
        onClose={() => setManualCopy(false)}
        title="Copy this text"
        description="Select the text below and copy it to use it elsewhere."
        footer={
          <button className="button primary" onClick={() => setManualCopy(false)}>
            Done
          </button>
        }
      >
        <label>
          Text to copy
          <textarea
            aria-label="Text to copy"
            className="copy-textarea"
            readOnly
            value={text}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      </Modal>
    </>
  );
}
