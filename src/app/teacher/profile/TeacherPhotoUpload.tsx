"use client";

import { ChangeEvent, useState } from "react";

type Props = { initials: string; hasPhoto: boolean };

export default function TeacherPhotoUpload({ initials, hasPhoto }: Props) {
  const [previewUrl, setPreviewUrl] = useState(hasPhoto ? "/api/teachers/me/photo" : "");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setMessage("Use JPG, PNG, or WebP"); event.target.value = ""; return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("Maximum file size is 5 MB"); event.target.value = ""; return; }
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setMessage("");
    setUploading(true);
    const formData = new FormData();
    formData.append("photo", file);
    try {
      const response = await fetch("/api/teachers/me/photo", { method: "POST", body: formData });
      const result = await response.json();
      if (response.ok) { setMessage("Photo saved"); setPreviewUrl(`/api/teachers/me/photo?updated=${Date.now()}`); } else setMessage(result.detail ? `${result.error ?? "Upload failed"} (${result.detail})` : result.error ?? "Upload failed");
    } catch { setMessage("Upload failed"); } finally { setUploading(false); URL.revokeObjectURL(localPreview); event.target.value = ""; }
  }

  return <div className="flex flex-col items-center gap-3"><div className="grid h-24 w-24 place-items-center overflow-hidden rounded-3xl bg-white/15 text-3xl font-bold ring-4 ring-white/10">{previewUrl ? <img src={previewUrl} alt="Teacher profile" className="h-full w-full object-cover" onError={() => setPreviewUrl("")} /> : initials}</div><label className="cursor-pointer rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading} className="sr-only" />{uploading ? "Uploading..." : message || "Upload photo"}</label></div>;
}
