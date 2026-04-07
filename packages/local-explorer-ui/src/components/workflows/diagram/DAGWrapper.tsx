import {
	animate,
	motion,
	useMotionTemplate,
	useMotionValue,
	useTransform,
	type PanInfo,
} from "motion/react";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
	type RefObject,
} from "react";
import { transitions } from "./transitions";

const PAN_SPACING = {
	y: 64,
	x: 16,
};

const MIN_SCROLLBAR_THUMB_SIZE = 10;

interface DAGWrapperProps {
	children: ReactNode;
	contentRef?: RefObject<HTMLDivElement | null>;
}

export function DAGWrapper({
	children,
	contentRef: externalContentRef,
}: DAGWrapperProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const internalContentRef = useRef<HTMLDivElement>(null);

	const mergedContentRef = useCallback(
		(node: HTMLDivElement | null) => {
			(
				internalContentRef as React.MutableRefObject<HTMLDivElement | null>
			).current = node;
			if (externalContentRef) {
				(
					externalContentRef as React.MutableRefObject<HTMLDivElement | null>
				).current = node;
			}
		},
		[externalContentRef]
	);

	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const [bounds, setBounds] = useState<{ x: number; y: number } | null>(null);
	const [dimensions, setDimensions] = useState<{
		viewportWidth: number;
		viewportHeight: number;
		contentWidth: number;
		contentHeight: number;
	} | null>(null);

	const [isPanning, setIsPanning] = useState(false);
	const [canPan, setCanPan] = useState(false);

	useEffect(() => {
		if (!wrapperRef.current || !internalContentRef.current) {
			return;
		}

		const measureBounds = () => {
			if (!wrapperRef.current || !internalContentRef.current) {
				return;
			}

			const wrapper = wrapperRef.current.getBoundingClientRect();
			const content = internalContentRef.current.getBoundingClientRect();

			const availableWidth = wrapper.width - PAN_SPACING.x * 2;
			const availableHeight = wrapper.height - PAN_SPACING.y * 2;

			setBounds({
				x: Math.min(0, availableWidth - content.width),
				y: Math.min(0, availableHeight - content.height),
			});

			setDimensions({
				viewportWidth: availableWidth,
				viewportHeight: availableHeight,
				contentWidth: content.width,
				contentHeight: content.height,
			});

			setCanPan(
				content.width > availableWidth || content.height > availableHeight
			);
		};

		measureBounds();

		const resizeObserver = new ResizeObserver(measureBounds);
		resizeObserver.observe(wrapperRef.current);
		resizeObserver.observe(internalContentRef.current);

		return () => resizeObserver.disconnect();
	}, []);

	useEffect(() => {
		if (!bounds) {
			return;
		}
		if (x.get() < bounds.x) {
			animate(x, bounds.x, transitions.swift);
		}
		if (y.get() < bounds.y) {
			animate(y, bounds.y, transitions.swift);
		}
	}, [bounds, x, y]);

	useEffect(() => {
		return () => {
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, []);

	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) {
			return;
		}

		const handleWheel = (e: WheelEvent) => {
			if (!bounds) {
				return;
			}
			const canScrollX = bounds.x < 0;
			const canScrollY = bounds.y < 0;
			if (!canScrollX && !canScrollY) {
				return;
			}
			e.preventDefault();
			if (canScrollY) {
				const newY = Math.max(bounds.y, Math.min(0, y.get() - e.deltaY));
				y.set(newY);
			}
			if (canScrollX) {
				const newX = Math.max(bounds.x, Math.min(0, x.get() - e.deltaX));
				x.set(newX);
			}
		};

		wrapper.addEventListener("wheel", handleWheel, { passive: false });
		return () => wrapper.removeEventListener("wheel", handleWheel);
	}, [bounds, x, y]);

	const handlePan = (_: PointerEvent, info: PanInfo) => {
		if (!bounds) {
			return;
		}
		x.set(Math.max(bounds.x, Math.min(0, x.get() + info.delta.x)));
		y.set(Math.max(bounds.y, Math.min(0, y.get() + info.delta.y)));
	};

	const canScrollX = bounds && bounds.x < 0;
	const canScrollY = bounds && bounds.y < 0;

	const scrollThumbWidth =
		dimensions && dimensions.contentWidth > 0 && dimensions.viewportWidth > 0
			? Math.max(
					MIN_SCROLLBAR_THUMB_SIZE,
					(dimensions.viewportWidth / dimensions.contentWidth) * 100
				)
			: 0;
	const scrollThumbHeight =
		dimensions && dimensions.contentHeight > 0 && dimensions.viewportHeight > 0
			? Math.max(
					MIN_SCROLLBAR_THUMB_SIZE,
					(dimensions.viewportHeight / dimensions.contentHeight) * 100
				)
			: 0;

	const scrollbarXPercent = useTransform(
		x,
		[0, bounds?.x ?? 0],
		[0, 100 - scrollThumbWidth]
	);
	const scrollbarYPercent = useTransform(
		y,
		[0, bounds?.y ?? 0],
		[0, 100 - scrollThumbHeight]
	);

	const scrollTop = useMotionTemplate`${scrollbarYPercent}%`;
	const scrollLeft = useMotionTemplate`${scrollbarXPercent}%`;

	return (
		<motion.div
			ref={wrapperRef}
			className="group relative isolate grow overflow-hidden px-4 py-16"
			style={{
				cursor: canPan && !isPanning ? "grab" : undefined,
			}}
			onPanStart={() => {
				setIsPanning(true);
				document.body.style.cursor = "grabbing";
				document.body.style.userSelect = "none";
			}}
			onPan={handlePan}
			onPanEnd={() => {
				setIsPanning(false);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}}
		>
			<motion.div
				ref={mergedContentRef}
				className="mx-auto w-max"
				style={{ x, y }}
			>
				{children}
			</motion.div>

			{canScrollY && (
				<div className="absolute top-4 right-1 bottom-4 z-50 w-1.5 rounded-full bg-neutral-200/50 opacity-0 group-hover:opacity-100 dark:bg-neutral-700/50">
					<motion.div
						className="absolute w-full rounded-full bg-neutral-400/70 dark:bg-neutral-500/70"
						style={{
							height: `${scrollThumbHeight}%`,
							top: scrollTop,
						}}
					/>
				</div>
			)}

			{canScrollX && (
				<div className="absolute right-4 bottom-1 left-4 z-50 h-1.5 rounded-full bg-neutral-200/50 opacity-0 group-hover:opacity-100 dark:bg-neutral-700/50">
					<motion.div
						className="absolute h-full rounded-full bg-neutral-400/70 dark:bg-neutral-500/70"
						style={{
							width: `${scrollThumbWidth}%`,
							left: scrollLeft,
						}}
					/>
				</div>
			)}
		</motion.div>
	);
}
