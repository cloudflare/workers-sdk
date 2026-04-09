import { useId } from "react";

export function BackgroundDots({ size = 12 }: { size?: number }) {
	const id = useId();
	return (
		<svg aria-hidden="true" width="100%" height="100%">
			<defs>
				<pattern
					id={id}
					viewBox={`-${size / 2} -${size / 2} ${size} ${size}`}
					patternUnits="userSpaceOnUse"
					width={size}
					height={size}
				>
					<circle cx="0" cy="0" r="1" fill="currentColor" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill={`url(#${id})`} />
		</svg>
	);
}
