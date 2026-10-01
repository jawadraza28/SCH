"use client";

import { ChangeEvent, SyntheticEvent, useState } from "react";

export default function PhotoUpload({ studentId }: { studentId: string }) {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(`/api/students/${studentId}/photo`);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setMessage("Use JPG, PNG, or WebP"); event.target.value = ""; return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("Maximum file size is 5 MB"); event.target.value = ""; return; }
    setMessage("");
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    const formData = new FormData();
    formData.append("photo", file);
    try {
      const response = await fetch(`/api/students/${studentId}/photo`, { method: "POST", body: formData });
      const result = await response.json();
      if (response.ok) { setMessage("Uploaded"); setPreviewUrl(`/api/students/${studentId}/photo?updated=${Date.now()}`); } else setMessage(result.error ?? "Upload failed");
    } catch { setMessage("Upload failed"); } finally { setUploading(false); URL.revokeObjectURL(localPreview); event.target.value = ""; }
  }

  return <div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-[10px] text-slate-400"><img src={previewUrl} alt="Student" className="h-full w-full object-cover" onError={(event: SyntheticEvent<HTMLImageElement>) => { event.currentTarget.style.display = "none"; }} /></div><label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading} className="sr-only" />{uploading ? "Uploading..." : message || "Upload photo"}</label></div>;
}