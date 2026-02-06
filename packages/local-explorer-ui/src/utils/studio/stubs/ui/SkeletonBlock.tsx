/**
 * Stub for SkeletonBlock loading component
 * Simplified version using Tailwind CSS
 */

import { cn } from "@cloudflare/kumo";

interface SkeletonBlockProps extends React.HTMLAttributes<HTMLDivElement> {
	height?: number | string;
	width?: number | string;
	mb?: number;
	p?: number;
}

export const SkeletonBlock = ({
	className,
	height,
	width,
	mb,
	p,
	style,
	...props
}: SkeletonBlockProps) => {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-md bg-gray-200 dark:bg-gray-700",
				"before:absolute before:inset-0 before:animate-pulse before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
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
};

export const LoadingWorkersSkeleton = () => (
	<>
		<SkeletonBlock mb={3} p={3} height={160} />
		<SkeletonBlock mb={3} p={3} height={160} />
		<SkeletonBlock mb={3} p={3} height={160} />
		<SkeletonBlock mb={3} p={3} height={160} />
	</>
);
