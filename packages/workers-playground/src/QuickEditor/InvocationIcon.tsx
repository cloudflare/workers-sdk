const InvocationIcon = ({
	size = 16,
	color,
}: {
	size?: number;
	color?: string;
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Invocation</title>
			<path
				d="M12.2721 6.39991H8.90707L9.95707 0.459912L9.04707 0.0974121L3.30957 8.74991L3.72707 9.52491H7.17707L6.23457 15.5249L7.14957 15.8699L12.6946 7.16741L12.2721 6.39991ZM7.59457 13.3274L8.24957 9.10991L7.74957 8.53241H4.65707L8.55457 2.65241L7.81957 6.81241L8.31957 7.39991H11.3696L7.59457 13.3274Z"
				fill={color || "currentColor"}
			/>
		</svg>
	);
};

export default InvocationIcon;
