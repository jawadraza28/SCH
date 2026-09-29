"use client";

import { ChangeEvent, useState } from "react";

export default function PhotoUpload({ studentId }: { studentId: string }) {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setUploading(true);
    const formData = new FormData();
    formData.append("photo", file);
    try {
      const response = await fetch(`/api/students/${studentId}/photo`, { method: "POST", body: formData });
      const result = await response.json();
      setMessage(response.ok ? "Uploaded" : result.detail ? `${result.error ?? "Upload failed"}: ${result.detail}` : result.error ?? "Upload failed");
    } catch {
      setMessage("Upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading} className="sr-only" />{uploading ? "Uploading..." : message || "Upload photo"}</label>;
}
