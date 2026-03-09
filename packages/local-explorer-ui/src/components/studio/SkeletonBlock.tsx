import { cn } from "@cloudflare/kumo";
import type { HTMLAttributes } from "react";

interface SkeletonBlockProps extends HTMLAttributes<HTMLDivElement> {
	height?: number | string;
	mb?: number;
	p?: number;
	width?: number | string;
}

export function SkeletonBlock({
	className,
	height,
	mb,
	p,
	style,
	width,
	...props
}: SkeletonBlockProps) {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-md bg-surface-tertiary",
				"before:absolute before:inset-0 before:animate-pulse before:bg-linear-to-r before:from-transparent before:via-white/20 before:to-transparent",
				className
			)}
			style={{
				height: typeof height === "number" ? `${height}px` : height,
				width: typeof width === "number" ? `${width}px` : width,
				marginBottom: mb ? `${mb * 4}px` : undefined,
				padding: p ? `${p * 4}px` : undefined,
				...style,
			}}
			{...props}
		>
			{/* Non-breaking space for sizing */}
			&nbsp;
		</div>
	);
}
