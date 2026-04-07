import { cn } from "@cloudflare/kumo";
import {
	motion,
	useAnimationFrame,
	useMotionTemplate,
	useMotionValue,
	useTransform,
	type MotionValue,
} from "motion/react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useDiagramContext } from "./context";

export type NodePosition = "center" | "left" | "right";

export function getNodePosition(
	index: number,
	total: number
): {
	position: NodePosition;
	middle?: boolean;
	center?: boolean;
} {
	let position: NodePosition = "center";
	const centerIndex = Math.floor(total / 2);
	const isOdd = total % 2 === 1;

	if (total !== 1) {
		if (isOdd && index === centerIndex) {
			position = "center";
		} else if (index < centerIndex) {
			position = "left";
		} else {
			position = "right";
		}
	}

	let middle = false;
	let center = false;
	switch (position) {
		case "left":
			middle = index > 0;
			center = !isOdd && index === centerIndex - 1;
			break;
		case "right":
			middle = index < total - 1;
			center = !isOdd && index === centerIndex;
			break;
		case "center":
			middle = total > 1;
			break;
	}

	return { position, middle, center };
}

export function SimpleConnector({
	middle,
	isBottom,
	shrink,
	height,
}: {
	middle?: boolean;
	isBottom?: boolean;
	shrink?: boolean;
	height?: number | string;
}) {
	if (middle) {
		return (
			<div
				className="relative flex h-(--connector-height) w-full flex-col items-center text-(--color-connector)"
				style={
					{
						"--connector-height":
							typeof height === "number" ? `${height}px` : height,
					} as CSSProperties
				}
			>
				<div className="relative flex w-full grow justify-center">
					<div
						className={cn(
							"absolute left-0 h-[calc(50%+1px)] w-[calc(50%+1px)] border-r-2 border-current",
							isBottom
								? "bottom-0 rounded-tr-xl border-t-2"
								: "rounded-br-xl border-b-2"
						)}
					/>
					<div className="h-full w-0.5 bg-current" />
					<div
						className={cn(
							"absolute right-0 h-[calc(50%+1px)] w-[calc(50%+1px)] border-l-2 border-current",
							isBottom
								? "bottom-0 rounded-tl-xl border-t-2"
								: "rounded-bl-xl border-b-2"
						)}
					/>
				</div>
			</div>
		);
	}
	return (
		<div
			className={cn(
				"flex grow flex-col items-center text-(--color-connector)",
				!shrink && "h-(--connector-height)"
			)}
			style={
				{
					"--connector-height":
						typeof height === "number" ? `${height}px` : height,
				} as CSSProperties
			}
		>
			<div className="w-0.5 grow bg-current" />
		</div>
	);
}

export function Connector({
	position,
	middle,
	isBottom,
}: {
	position: "left" | "right";
	isBottom?: boolean;
	middle?: boolean;
}) {
	return (
		<div
			className={cn(
				"relative flex h-[calc(var(--connector-height)/2)] w-full justify-center text-(--color-connector)",
				isBottom ? "-mb-0.5" : "-mt-0.5"
			)}
		>
			<div
				className={cn(
					"absolute",
					isBottom ? "bottom-0 z-10 border-b-2" : "top-0 border-t-2",
					middle ? "border-current" : "border-(--color-background)",
					position === "right" && "right-0 left-[calc(50%-12px)]",
					position === "left" && "right-[calc(50%-12px)] left-0"
				)}
			/>
			<div
				className={cn(
					"relative h-full w-4 border-current",
					isBottom ? "z-20 border-b-2" : "border-t-2",
					{
						"rounded-tr-xl": !isBottom && position === "right",
						"rounded-tl-xl": !isBottom && position === "left",
						"rounded-br-xl": isBottom && position === "right",
						"rounded-bl-xl": isBottom && position === "left",
					},
					position === "right" && "-ml-3.5 border-r-2",
					position === "left" && "-mr-3.5 border-l-2"
				)}
			/>
		</div>
	);
}

export function MergeConnector({
	variant = "both",
	isBottom,
}: {
	variant?: "left" | "right" | "both";
	isBottom?: boolean;
}) {
	return (
		<div
			className={cn(
				"relative -mb-[3px] flex h-[calc(var(--connector-height)/2)] flex-col items-center",
				isBottom && "-mt-[3px] flex-col-reverse"
			)}
		>
			<div className="h-full border-r-2 border-(--color-connector)" />
			<div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
				{variant !== "right" && (
					<div className="h-0.5 bg-(--color-connector)" />
				)}
				<div className="size-2 rounded-xs bg-(--color-connector)" />
				{variant !== "left" && <div className="h-0.5 bg-(--color-connector)" />}
			</div>
		</div>
	);
}

export function Pill({ children }: { children: ReactNode }) {
	return (
		<div className="mx-auto w-fit rounded-full bg-kumo-base px-1.5 py-0.5 text-xs whitespace-nowrap text-kumo-subtle shadow-xs ring ring-kumo-fill">
			{children}
		</div>
	);
}

function useMultipleTransform<FirstType, SecondType, Result>(
	values: [MotionValue<FirstType>, MotionValue<SecondType>],
	cb: (first: FirstType, second: SecondType) => Result
): MotionValue<Result> {
	const [first, second] = values;
	const result = useMotionValue(cb(first.get(), second.get()));

	useEffect(() => {
		const unsubFirst = first.on("change", (v) => {
			result.set(cb(v, second.get()));
		});
		const unsubSecond = second.on("change", (v) => {
			result.set(cb(first.get(), v));
		});
		return () => {
			unsubFirst();
			unsubSecond();
		};
	}, [first, second, cb, result]);

	return result;
}

export function SvgConnector({
	diff,
	isBottom = false,
}: {
	diff: MotionValue<number>;
	isBottom?: boolean;
}) {
	const diffInverse = useTransform(diff, (v) => v * -1);
	const diffInverseCapped = useTransform(diffInverse, [-12, 12], [-12, 12]);
	const d = useMotionTemplate`M 16 25 v -12 q 0 -12 ${diffInverseCapped} -12`;
	const dBottom = useMotionTemplate`M 16 0 v 12 q 0 12 ${diffInverseCapped} 12`;
	return (
		<svg
			className={cn("mx-auto", isBottom ? "-mb-0.5" : "-mt-0.5")}
			viewBox="0 0 32 25"
			width="32"
			height="25"
		>
			<motion.path
				d={isBottom ? dBottom : d}
				strokeWidth="2"
				className="stroke-(--color-connector)"
				fill="none"
			/>
		</svg>
	);
}

function MotionConnector({
	x,
	relativeTo,
	isBottom = false,
}: {
	x: MotionValue<number>;
	relativeTo: MotionValue<number>;
	isBottom?: boolean;
}) {
	const diff = useMultipleTransform([x, relativeTo], (newX, r) => newX - r);
	return <SvgConnector diff={diff} isBottom={isBottom} />;
}

function CenterConnector({
	x,
	relativeTo,
	isBottom,
}: {
	x?: MotionValue<number>;
	relativeTo?: MotionValue<number>;
	isBottom?: boolean;
}) {
	if (x && relativeTo) {
		return (
			<MotionConnector x={x} relativeTo={relativeTo} isBottom={isBottom} />
		);
	}
	return (
		<div
			className={cn(
				"relative mx-auto h-[calc(var(--connector-height)/2)] w-0.5 bg-(--color-connector)",
				!isBottom && "-mt-0.5"
			)}
		/>
	);
}

export function ConnectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className="relative z-10">
			<Pill>{children}</Pill>
			<SimpleConnector height={12} isBottom />
		</div>
	);
}

interface ParallelNodeWrapperProps {
	index: number;
	total: number;
	children: ReactNode;
	label?: ReactNode;
	groupCenter: MotionValue<number>;
}

export function ParallelNodeWrapper({
	label,
	index,
	total,
	children,
	groupCenter,
}: ParallelNodeWrapperProps) {
	const ref = useRef<HTMLLIElement>(null);
	const x = useMotionValue(0);
	const { position, middle } = getNodePosition(index, total);
	const { isAnimating } = useDiagramContext();

	useEffect(() => {
		if (!ref.current) {
			return;
		}
		const rect = ref.current.getBoundingClientRect();
		x.set(rect.x + rect.width / 2);
	}, [x]);

	useAnimationFrame(() => {
		if (!isAnimating || !ref.current) {
			return;
		}
		const rect = ref.current.getBoundingClientRect();
		x.set(rect.x + rect.width / 2);
	});

	return (
		<li ref={ref} className="relative flex min-w-16 flex-col" key={index}>
			{position === "center" ? (
				<CenterConnector x={x} relativeTo={groupCenter} />
			) : (
				<Connector position={position} middle={middle} />
			)}
			<div>
				{label && <ConnectionLabel>{label}</ConnectionLabel>}
				<div className="flex justify-center px-4">{children}</div>
			</div>
			<SimpleConnector isBottom shrink />
			{position === "center" ? (
				<CenterConnector x={x} relativeTo={groupCenter} isBottom />
			) : (
				<Connector position={position} middle={middle} isBottom />
			)}
		</li>
	);
}
