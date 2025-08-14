import debug from "debug";

debug.log = () => {
	throw new Error("Test if vite is using the shim");
};

export default debug;
