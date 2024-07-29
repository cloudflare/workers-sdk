export const onRequest = ({ passThroughOnException, next }) => {
	passThroughOnException();

	return next();
};
