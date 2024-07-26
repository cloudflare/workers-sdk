import { Toast } from "@cloudflare/component-toast";
import { Div } from "@cloudflare/elements";
import React from "react";

export const FrameError = ({ children }: { children: React.ReactNode }) => {
	return (
		<Div p={3} zIndex={100} position="relative">
			<Toast type="error">{children}</Toast>
		</Div>
	);
};

class FrameErrorBoundary extends React.Component<
	{ fallback: React.ReactNode; children: React.ReactNode },
	{ hasError: boolean }
> {
	state = {
		hasError: false,
	};

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: unknown) {
		console.error(error);
		console.info(info);
	}

	render() {
		const { fallback, children } = this.props;
		const { hasError } = this.state;
		return hasError ? <FrameError>{fallback}</FrameError> : children;
	}
}

export default FrameErrorBoundary;
