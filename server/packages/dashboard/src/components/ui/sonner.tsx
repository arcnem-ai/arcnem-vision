"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
	return (
		<Sonner
			closeButton
			position="top-right"
			richColors
			theme="light"
			{...props}
		/>
	);
}
