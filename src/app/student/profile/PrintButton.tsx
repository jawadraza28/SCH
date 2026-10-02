"use client";

import { useEffect } from "react";

export default function PrintButton() {
	useEffect(() => {
		const clearOrientation = () => document.documentElement.removeAttribute("data-print-orientation");
		window.addEventListener("afterprint", clearOrientation);
		return () => window.removeEventListener("afterprint", clearOrientation);
	}, []);

	function printCard() {
		document.documentElement.setAttribute("data-print-orientation", "landscape");
		window.print();
	}
	return <button type="button" onClick={printCard} className="print:hidden rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Print ID card</button>;
}
