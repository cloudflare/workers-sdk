import { foo } from "./another";
      export default {
        async fetch(request) {
          return new Response('Hello' + foo);
        },
      };