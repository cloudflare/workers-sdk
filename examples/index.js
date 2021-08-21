import { now } from "./dep";
export default {
  fetch(request) {
    console.log(
      request.method,
      request.url,
      new Map([...request.headers]),
      request.cf
    );

    return new Response(`${request.url} ${now()}`);
  },
};
