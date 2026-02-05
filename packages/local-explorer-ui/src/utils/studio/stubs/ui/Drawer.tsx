import { cn } from "@cloudflare/kumo";
import { useEffect, useRef } from "react";
import * as React from "react";
import type { PropsWithChildren, ReactNode } from "react";

/**
 * Stub for Drawer component
 * Simplified version using native HTML/CSS with Tailwind
 */

interface DrawerProps {
	isOpen?: boolean;
	onClose?: () => void;
	width?: number | string;
	title?: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
}

interface DrawerHeaderProps extends PropsWithChildren {
	description?: ReactNode;
}

interface DrawerBodyProps extends PropsWithChildren {}
interface DrawerFooterProps extends PropsWithChildren {}

const DrawerContext = React.createContext<{
	onClose?: () => void;
}>({});

export function Drawer({
	isOpen,
	onClose,
	width = 400,
	children,
}: DrawerProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	// Close on escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isOpen) {
				onClose?.();
			}
		};
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isOpen, onClose]);

	// Prevent body scroll when open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	return (
		<DrawerContext.Provider value={{ onClose }}>
			{/* Overlay */}
			<div
				className={cn(
					"fixed inset-0 z-[1200] bg-white/40 transition-opacity duration-300",
					isOpen ? "opacity-100" : "pointer-events-none opacity-0"
				)}
				onClick={onClose}
			/>

			{/* Drawer container */}
			<div
				ref={containerRef}
				role="dialog"
				aria-modal="true"
				className={cn(
					"fixed bottom-0 right-0 top-0 z-[99999] flex flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-in-out dark:border-gray-700 dark:bg-gray-900",
					isOpen ? "translate-x-0" : "translate-x-full"
				)}
				style={{
					width: typeof width === "number" ? `${width}px` : width,
					maxWidth: "75%",
				}}
			>
				{children}
			</div>
		</DrawerContext.Provider>
	);
}

Drawer.Header = function DrawerHeader({
	children,
	description,
}: DrawerHeaderProps) {
	const { onClose } = React.useContext(DrawerContext);

	return (
		<div className="relative sticky top-0 bg-white p-4 dark:bg-gray-900">
			<div className="grid grid-cols-[1fr_min-content] gap-x-3 gap-y-2">
				<div className="text-lg font-semibold">{children}</div>
				<button
					onClick={onClose}
					className="absolute right-2 top-2 rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fillRule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clipRule="evenodd"
						/>
					</svg>
				</button>
				{description && (
					<div className="text-sm text-gray-500">{description}</div>
				)}
			</div>
		</div>
	);
};

Drawer.Body = function DrawerBody({ children }: DrawerBodyProps) {
	return (
		<div className="flex-1 overflow-y-auto border-y border-gray-200 p-4 dark:border-gray-700">
			{children}
		</div>
	);
};

Drawer.Footer = function DrawerFooter({ children }: DrawerFooterProps) {
	return (
		<div className="sticky bottom-0 bg-white p-4 dark:bg-gray-900">
			{children}
		</div>
	);
};

export function FooterActions({
	children,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div className="flex justify-end gap-2" {...props}>
			{children}
		</div>
	);
}
