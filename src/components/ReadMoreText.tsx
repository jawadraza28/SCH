"use client";

import { useId, useState } from "react";

export default function ReadMoreText({ text, previewLength = 320, className = "" }: { text: string; previewLength?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  if (text.length <= previewLength) {
    return <p className={`whitespace-pre-wrap break-words ${className}`}>{text}</p>;
  }

  const boundary = text.lastIndexOf(" ", previewLength);
  const preview = text.slice(0, boundary > previewLength * 0.6 ? boundary : previewLength);
  return (
    <div>
      <p id={contentId} className={`whitespace-pre-wrap break-words ${className}`}>
        {expanded ? text : `${preview.trimEnd()}…`}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
        className="mt-2 text-sm font-semibold text-blue-300 underline decoration-blue-300/50 underline-offset-4 hover:text-blue-200"
      >
        {expanded ? "Read less" : "Read more"}
      </button>
    </div>
  );
}
