export const isCINonLinux =
	process.platform !== "linux" && process.env.CI === "true";
