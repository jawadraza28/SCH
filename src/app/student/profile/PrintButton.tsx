"use client";

import { useState } from "react";

export default function PrintButton() {
	const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
	function printCard() {
		document.documentElement.setAttribute("data-print-orientation", orientation);
		window.print();
	}
	return <div className="print:hidden flex flex-wrap items-center gap-2"><select value={orientation} onChange={(event) => setOrientation(event.target.value as "portrait" | "landscape")} aria-label="Print orientation" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select><button type="button" onClick={printCard} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Print ID card</button></div>;
}
