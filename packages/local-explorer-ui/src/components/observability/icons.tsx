/**
 * Span-kind icons, ported verbatim from the Workers Observability dashboard
 * (stratus: common/components/WorkersObservability/components/traces/icons/tracing.tsx)
 * so the local waterfall matches the dashboard pixel-for-pixel.
 */
import { spanKind } from "../../utils/observability";
import type { LayoutSpan } from "../../utils/observability";
import type { JSX } from "react";

type IconProps = { size?: number; color?: string; className?: string };

export const CloudflareDbIcon = ({
	size = 20,
	color = "#F6821F",
	className = "",
}: IconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 20 20"
		fill="none"
		className={className}
	>
		<path d="M6.875 14.0469H4.6875V12.7969H6.875V14.0469Z" fill={color} />
		<path d="M4.6875 11.5469H6.875V10.2969H4.6875V11.5469Z" fill={color} />
		<path d="M6.875 9.04686H4.6875V7.79686H6.875V9.04686Z" fill={color} />
		<path
			d="M8.125 14.0469L15.3125 14.0469V12.7969L8.125 12.7969V14.0469Z"
			fill={color}
		/>
		<path
			d="M15.3125 11.5469L8.125 11.5469V10.2969L15.3125 10.2969V11.5469Z"
			fill={color}
		/>
		<path
			d="M8.125 9.04686L15.3125 9.04686V7.79686L8.125 7.79686V9.04686Z"
			fill={color}
		/>
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			d="M1.875 3.75L2.5 3.125H8.4375L8.96096 3.40851L10.026 5.04112H17.5L18.125 5.66612V16.25L17.5 16.875H2.5L1.875 16.25V3.75ZM3.125 4.375V15.625H16.875V6.29112H9.6875L9.16404 6.0076L8.09899 4.375H3.125Z"
			fill={color}
		/>
	</svg>
);

export const WorkerIcon = ({
	size = 20,
	color = "#F6821F",
	className = "",
}: IconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 20 20"
		fill="none"
		className={className}
	>
		<path
			d="M7.7626 15.3656L3.74385 9.99062L7.74072 4.76875L6.96885 3.71563L2.46572 9.60625L2.45947 10.3594L6.98447 16.4188L7.7626 15.3656Z"
			fill={color}
		/>
		<path
			d="M9.16572 2.48438H7.61885L13.197 10.1094L7.7501 17.4844H9.30635L14.7501 10.1125L9.16572 2.48438Z"
			fill={color}
		/>
		<path
			d="M12.1563 2.48438H10.5907L16.2563 10.0188L10.5907 17.4844H12.1595L17.5376 10.3969V9.64375L12.1563 2.48438Z"
			fill={color}
		/>
	</svg>
);

export const HttpIcon = ({
	size = 16,
	color = "#7366E4",
	className = "",
}: IconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 48 48"
		fill="none"
		className={className}
	>
		<g transform="translate(24, 24) scale(0.9) translate(-24, -24)">
			<path
				d="M1.2002 31.2V16.8H4.52635V22.425H8.92931V16.8H12.2555V31.2H8.92931V25.575H4.52635V31.2H1.2002Z"
				fill={color}
			/>
			<path
				d="M13.4998 19.95V16.8H24.1483V19.95H20.4632V31.2H17.1849V19.95H13.4998Z"
				fill={color}
			/>
			<path
				d="M25.065 19.95V16.8H35.7135V19.95H32.0284V31.2H28.7501V19.95H25.065Z"
				fill={color}
			/>
			<path
				d="M36.9653 31.2V16.8H42.2537C43.163 16.8 43.9586 17.011 44.6406 17.4329C45.3226 17.8547 45.853 18.4477 46.2319 19.2118C46.6108 19.9758 46.8002 20.8688 46.8002 21.8907C46.8002 22.9219 46.6048 23.8149 46.2139 24.5696C45.8271 25.3243 45.2827 25.9055 44.5808 26.3133C43.8828 26.7211 43.0672 26.925 42.134 26.925H38.9754V23.8875H41.464C41.8548 23.8875 42.1878 23.8079 42.463 23.6485C42.7422 23.4844 42.9556 23.2524 43.1031 22.9524C43.2547 22.6524 43.3305 22.2985 43.3305 21.8907C43.3305 21.4782 43.2547 21.1266 43.1031 20.836C42.9556 20.5407 42.7422 20.3157 42.463 20.161C42.1878 20.0016 41.8548 19.9219 41.464 19.9219H40.2915V31.2H36.9653Z"
				fill={color}
			/>
		</g>
	</svg>
);

export const DurableObjectIcon = ({
	size = 20,
	color = "#F6821F",
	className = "",
}: IconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 20 20"
		fill="none"
		className={className}
	>
		<path
			d="M7.34174 6.0692C7.04548 5.64457 6.46108 5.5405 6.03645 5.83676C5.61182 6.13302 5.50775 6.71742 5.80401 7.14205C6.10027 7.56669 6.68467 7.67075 7.1093 7.37449C7.53393 7.07823 7.638 6.49384 7.34174 6.0692Z"
			fill={color}
		/>
		<path
			d="M14.2059 14.1897C13.7813 14.486 13.1969 14.3819 12.9006 13.9573C12.6043 13.5326 12.7084 12.9482 13.133 12.652C13.5577 12.3557 14.1421 12.4598 14.4383 12.8844C14.7346 13.3091 14.6305 13.8935 14.2059 14.1897Z"
			fill={color}
		/>
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			d="M10.067 1.87524C10.046 1.87508 10.025 1.875 10.0039 1.875C8.39694 1.875 6.82605 2.35152 5.4899 3.24431C4.15375 4.1371 3.11235 5.40605 2.49739 6.8907C2.08709 7.88125 1.87891 8.93814 1.87891 10C1.8789 10.5297 1.93069 11.0606 2.03503 11.5851C2.34853 13.1612 3.12237 14.6089 4.25867 15.7452C5.39497 16.8815 6.8427 17.6554 8.4188 17.9689C8.96421 18.0774 9.51651 18.129 10.0672 18.1248C10.0801 18.1249 10.0931 18.125 10.1061 18.125C10.1614 18.125 10.2163 18.1235 10.2706 18.1206C11.2424 18.0887 12.2056 17.8825 13.1132 17.5065C14.5979 16.8916 15.8668 15.8502 16.7596 14.514C17.6524 13.1779 18.1289 11.607 18.1289 10C18.1289 7.84512 17.2729 5.77849 15.7492 4.25476C14.2884 2.79396 12.3286 1.94686 10.2705 1.87937C10.2162 1.87647 10.1614 1.875 10.1061 1.875C10.0931 1.875 10.08 1.87508 10.067 1.87524ZM9.37516 3.28712V9.375H6.8474C6.91796 7.63009 7.28236 6.09388 7.84443 4.97779C8.28954 4.0939 8.81785 3.54022 9.37516 3.28712ZM10.6252 3.28712C11.1825 3.54022 11.7108 4.0939 12.1559 4.97779C12.718 6.09388 13.0824 7.63009 13.1529 9.375H10.6252V3.28712ZM14.4036 9.375C14.3343 7.50173 13.9684 5.78028 13.3724 4.41557C13.3101 4.27268 13.2451 4.13362 13.1773 3.99845C14.7843 4.74738 16.0444 6.10153 16.6797 7.76799C16.8918 8.32443 17.0314 8.92096 17.0894 9.375H14.4036ZM14.4036 10.625H17.0894C17.0314 11.079 16.8918 11.6756 16.6797 12.232C16.0444 13.8985 14.7843 15.2526 13.1773 16.0015C13.2451 15.8664 13.3101 15.7273 13.3724 15.5844C13.9684 14.2197 14.3343 12.4983 14.4036 10.625Z"
			fill={color}
		/>
	</svg>
);

export const SpanIcon = ({
	size = 16,
	color = "#595959",
	className = "",
}: IconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="none"
		className={className}
	>
		<path
			d="M13 1H3C1.89543 1 1 1.89543 1 3V13C1 14.1046 1.89543 15 3 15H13C14.1046 15 15 14.1046 15 13V3C15 1.89543 14.1046 1 13 1Z"
			stroke={color}
			strokeWidth="1"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M4.5 5H11.5"
			stroke={color}
			strokeWidth="1"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M4 8H10"
			stroke={color}
			strokeWidth="1"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M6 11H11.5"
			stroke={color}
			strokeWidth="1"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

/** Mirror of the dashboard's getSpanIcon, mapped onto our span kinds. */
export function getSpanIcon(span: LayoutSpan): (p: IconProps) => JSX.Element {
	if (span.depth === 0) {
		return WorkerIcon; // root invocation
	}
	switch (spanKind(span)) {
		case "http":
		case "fetch":
			return HttpIcon;
		case "d1":
		case "kv":
		case "r2":
			return CloudflareDbIcon;
		case "do":
			return DurableObjectIcon;
		default:
			return SpanIcon;
	}
}
