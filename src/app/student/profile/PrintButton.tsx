"use client";

export default function PrintButton() { return <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white print:hidden">Print ID card</button>; }
