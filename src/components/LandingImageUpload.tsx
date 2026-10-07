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

  function remove() {
    onChange("", "");
  }

  const hasImage = Boolean(value);

  return (
    <div className="w-full">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="mt-2 flex flex-col items-start gap-3">
        {/* Preview frame */}
        <div className={`grid shrink-0 place-items-center overflow-hidden bg-slate-100 text-xs text-slate-400 ${frameClass}`}>
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-slate-400">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs">No image</span>
            </div>
          )}
        </div>

        {/* Action buttons — stacked full-width below the preview so the narrow
            photo columns of the landing editor can never squeeze the labels
            into letter towers (they used to break "Replace" mid-word). */}
        <div className="flex w-full flex-col gap-2 sm:max-w-56">
          {/* Upload / Replace button */}
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px] w-full whitespace-nowrap" style={{ touchAction: 'manipulation' }}>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} className="sr-only" />
            <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{busy ? "Uploading…" : hasImage ? "Replace" : "Upload"}</span>
          </label>

          {/* Remove button - only shown when image exists */}
          {hasImage && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-100 transition-colors min-h-[44px] w-full whitespace-nowrap"
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>

      {hint && <p className="mt-2 text-xs text-slate-400 max-w-xs sm:max-w-[16rem]">{hint}</p>}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}