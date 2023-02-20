export const onRequest = ({ passThroughOnException }) => {
	passThroughOnException();
	// @ts-expect-error expecting ReferenceError
	x;
};
