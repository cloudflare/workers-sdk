import type { ComponentProps } from "react";

interface AnimatedCloudflareLogoProps extends ComponentProps<"div"> {
	/**
	 * Size of the logo in pixels (width, height is proportional)
	 */
	size?: number;
}

export function AnimatedCloudflareLogo({
	size = 60,
	...props
}: AnimatedCloudflareLogoProps) {
	// Height is proportional to the viewBox ratio (31/57 ≈ 0.544)
	const height = Math.round(size * (31 / 57));

	return (
		<div {...props}>
			{/* Hidden SVG with reusable path definitions */}
			<svg className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
				<defs>
					<path
						id="loader-cloud"
						d="M38.052 25.669a.3.3 0 0 1-.06.006h-.013l-37.25-.007a.39.39 0 0 1-.391-.339 9 9 0 0 1-.088-1.234c0-4.619 3.665-8.382 8.234-8.518a6 6 0 0 1-.155-2.096c.277-2.814 2.524-5.079 5.325-5.357a5.96 5.96 0 0 1 4.192 1.166C19.621 4.034 24.575.25 30.406.25c5.817 0 10.765 3.769 12.541 9.012q.003-.004.004-.002c.024.071.055.173.091.293q.1.32.184.645c.152.545.299 1.098.299 1.098l1.649-.004h.263c1.067 0 1.998.152 2.809.436a11.08 11.08 0 0 1 7.957 10.639c0 1.044-.142 2.048-.412 3.004a.42.42 0 0 1-.398.298z"
					/>
					<path
						id="loader-cutout"
						d="M45.328 7.581a70 70 0 0 1-1.038 3.978l-.797 2.754c-.344 1.18-.216 2.278.358 3.079.526.739 1.404 1.173 2.47 1.227l4.3.258a.38.38 0 0 1 .303.169.41.41 0 0 1 .048.367.54.54 0 0 1-.466.359l-4.468.258c-2.423.115-5.042 2.082-5.96 4.483l-.324.847c-.025.063-1.291 3.404-1.546 4.348l-.014.054a.455.455 0 0 1-.866-.27l.005-.018c.261-.828 1.06-4.058 1.084-4.142l.284-.997c.344-1.18.216-2.279-.358-3.079-.526-.739-1.404-1.173-2.47-1.227l-20.181-.258a.4.4 0 0 1-.317-.17.4.4 0 0 1-.04-.366.54.54 0 0 1 .465-.359l20.363-.258c2.416-.108 5.028-2.082 5.946-4.483l1.161-3.052c.404-1.345 1.021-3.042 1.176-3.716a.454.454 0 0 1 .882.214"
					/>
				</defs>
			</svg>

			{/* Main animated logo */}
			<div className="relative" style={{ width: size, height }}>
				<div
					className="absolute inset-0 origin-center animate-[animated-logo-container_1s_ease-out_forwards] overflow-visible motion-reduce:scale-100 motion-reduce:animate-none motion-reduce:opacity-100"
					aria-hidden="true"
				>
					<svg viewBox="0 0 57 31">
						<defs>
							<mask id="animated-logo-mask">
								<rect width="100%" height="100%" fill="white" />
								<use
									href="#loader-cutout"
									className="origin-[41.061px_19.219px] animate-[animated-logo-cutout_1s_ease-out_forwards] fill-black transform-view motion-reduce:scale-100 motion-reduce:animate-none"
								/>
							</mask>
						</defs>
						<use
							href="#loader-cloud"
							className="animate-[animated-logo-cloud_1s_ease-out_forwards] fill-[#f38020] stroke-[#f38020] stroke-[0.5] [fill-opacity:0] [stroke-dasharray:145] [stroke-dashoffset:145] motion-reduce:animate-none motion-reduce:[fill-opacity:1] motion-reduce:[stroke-dashoffset:0]"
							mask="url(#animated-logo-mask)"
						/>
					</svg>
				</div>
			</div>
		</div>
	);
}
