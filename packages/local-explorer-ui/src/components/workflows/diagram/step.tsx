import { cn } from "@cloudflare/kumo";
import { DoIcon, SleepIcon, WaitForEventIcon } from "./icons";
import type { ReactNode } from "react";

function StepIcon({ type }: { type: "do" | "waitForEvent" | "sleep" }) {
	if (type === "do") {
		return <DoIcon />;
	}
	if (type === "sleep") {
		return <SleepIcon />;
	}
	return <WaitForEventIcon />;
}

export function StepConnector({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"relative z-30 mx-auto size-3 rounded border bg-kumo-base",
				"border-kumo-fill",
				className
			)}
		/>
	);
}

export function StepWrapper({
	className,
	type,
	children,
	variant = "static",
}: {
	className?: string;
	type: ReactNode;
	children: ReactNode;
	variant?: "default" | "error" | "static" | "skipped";
}) {
	return (
		<div className={cn("w-fit", className)}>
			<div
				className={cn(
					"mx-auto h-[5px] w-2.5 rounded-t-xs",
					"bg-(--color-connector)"
				)}
			/>
			<div
				className={cn(
					"relative z-20 w-fit overflow-hidden rounded-lg bg-kumo-base text-base shadow-md ring",
					"shadow-black/7 ring-kumo-fill",
					variant === "skipped" && "text-kumo-subtle shadow-none"
				)}
			>
				<header
					className={cn(
						"flex justify-between border-b border-kumo-fill bg-kumo-elevated px-2 py-1 text-kumo-subtle",
						variant === "skipped" && "text-kumo-subtle"
					)}
				>
					<p className="font-mono text-xs font-normal">{type}</p>
				</header>
				{children}
			</div>
			<StepConnector className="-mt-1.5" />
		</div>
	);
}

export function Step({
	node,
}: {
	node: {
		type: "do" | "waitForEvent" | "sleep";
		name: string;
	};
}) {
	return (
		<StepWrapper type={node.type} variant="static">
			<div className="flex gap-1 py-2 pr-2.5 pl-2">
				<span className="flex items-center">
					<StepIcon type={node.type} />
				</span>
				<span className="min-w-0 truncate font-normal">{node.name}</span>
			</div>
		</StepWrapper>
	);
}
