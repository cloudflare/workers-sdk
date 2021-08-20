export default {
  fetch(request) {
    console.log(
      request.method,
      request.url,
      new Map([...request.headers]),
      request.cf
    );

    return new Response(Date.now());
  },
};
