export const onRequest = ({ passThroughOnException }) => {
	// @ts-expect-error expecting ReferenceError
	x;
};
