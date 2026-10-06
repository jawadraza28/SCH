"use client";

import { useState, type ChangeEvent } from "react";

/**
 * A single image field for the landing-page editor.
 *
 * It compresses + uploads the chosen file through /api/school-settings/media,
 * which stores it on Cloudinary and hands back the secure URL and public id.
 * The parent keeps both in its own state (the public id travels with the
 * content so the API can delete the asset if the picture is later removed or
 * replaced). Removing only clears the field locally — the asset is cleaned up
 * server-side the next time the content is saved.
 */

type Kind = "cover" | "logo" | "principal" | "topStudent" | "news" | "gallery";

type Props = {
  /** Where the picture is used — decides the Cloudinary folder and size cap. */
  kind: Kind;
  /** The current Cloudinary secure URL, or "" when empty. */
  value: string;
  /** Receives the new URL and public id ("" clears the field). */
  onChange: (url: string, publicId: string) => void;
  label?: string;
  /** Extra classes for the preview frame (height/rounding live with the caller). */
  frameClass?: string;
  hint?: string;
};

export default function LandingImageUpload({ kind, value, onChange, label = "Image", frameClass = "h-40 w-full sm:w-40", hint }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const response = await fetch("/api/school-settings/media", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to upload the image");
        return;
      }
      onChange(String(result.url ?? ""), String(result.publicId ?? ""));
    } catch {
      setError("Unable to reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className={`grid shrink-0 place-items-center overflow-hidden bg-slate-100 text-xs text-slate-400 ${frameClass}`}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>No image</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} className="sr-only" />
            {busy ? "Uploading…" : value ? "Replace image" : "Upload image"}
          </label>
          {value ? (
            <button type="button" onClick={() => onChange("", "")} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">
              Remove
            </button>
          ) : null}
          {hint ? <p className="max-w-[16rem] text-xs text-slate-400">{hint}</p> : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}