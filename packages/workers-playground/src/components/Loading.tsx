import { useEffect, useRef } from "react";

import { Trans } from "@cloudflare/intl-react";
import { VisuallyHiddenSpan } from "@cloudflare/component-visually-hidden";
import { theme } from "@cloudflare/style-const";

type Props = {
	color?: string;
	size?: "1x" | "1.5x" | "2x" | "2.5x" | "3x" | "3.5x" | "4x";
};

const DEFAULT_HEIGHT = 15; // px
const ARC_THICKNESS = 0.151; // relative to diameter
const ANGLE_STEP = Math.PI / 30; // radians/frame (regulates animation speed)
const MIN_ARC_LENGTH = 0.01; // ratio of full circle
const MAX_ARC_LENGTH = 0.8; // ratio of full circle

function Loading({ color, size: layoutSize = "1x" }: Props) {
	const canvas = useRef<HTMLCanvasElement | null>(null);

	const size = Math.round(DEFAULT_HEIGHT * Number(layoutSize.replace("x", "")));

	useEffect(() => {
		if (canvas.current) {
			const ctx = canvas.current?.getContext("2d");

			if (!ctx) {
				return; // canvas not available (f.e. in tests)
			}
			ctx.resetTransform();

			// Keep it crisp on retina devices
			const scaleFactor = window.devicePixelRatio || 1;
			ctx.scale(scaleFactor, scaleFactor);
			const radius = size / 2;
			const arcThickness = Math.floor(size * ARC_THICKNESS);
			const angleStep = ANGLE_STEP;
			const arcLengthRange = [MIN_ARC_LENGTH, MAX_ARC_LENGTH].map(
				(p) => p * 2 * Math.PI
			);
			const arcProps = [
				0, // center X
				0, // center Y
				radius - arcThickness / 2, // radius
			] as const;

			ctx.translate(radius, radius); // center at (0,0)
			ctx.strokeStyle = color || theme.colors.gray[5];
			ctx.lineWidth = arcThickness;

			let arcLength = 0;
			let fwd = true;

			let rafId: number;

			const onFrame = () => {
				ctx.clearRect(-radius, -radius, size, size);
				ctx.rotate(angleStep);

				const halfArcLength = Math.max(0, arcLength / 2);

				ctx.beginPath();
				ctx.arc(...arcProps, -halfArcLength, halfArcLength);
				ctx.stroke();

				if (arcLength <= arcLengthRange[0]) {
					fwd = true;
				}
				if (arcLength >= arcLengthRange[1]) {
					fwd = false;
				}
				arcLength += (fwd ? 1 : -1) * angleStep;

				rafId = requestAnimationFrame(onFrame);
			};

			rafId = requestAnimationFrame(onFrame);

			return () => {
				if (rafId) {
					// stop frame ticker
					cancelAnimationFrame(rafId);
				}
			};
		}
	}, []);

	const scaledHeight = size * (window.devicePixelRatio || 1);

	return (
		<div>
			<canvas
				ref={canvas}
				style={{
					width: size,
					height: size,
				}}
				width={scaledHeight}
				height={scaledHeight}
			/>
			{/* @ts-ignore */}
			<VisuallyHiddenSpan>
				<Trans id="accessibility.content_loading" _="Content loading" />
			</VisuallyHiddenSpan>
		</div>
	);
}

export default Loading;
