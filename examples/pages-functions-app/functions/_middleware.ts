export const onRequest = async ({ next }) => {
  const response = await next();
  response.headers.set("x-custom", "header value");
  response.headers.set("set-cookie", "numberOne=Riker");
  response.headers.append("set-cookie", "otherNumberOne=NumberOne");
  return response;
};
