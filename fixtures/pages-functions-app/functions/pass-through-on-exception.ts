export const onRequest = ({ passThroughOnException }) => {
	passThroughOnException();
	throw new Response("ha!");
};
