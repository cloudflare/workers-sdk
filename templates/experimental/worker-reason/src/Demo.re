// type declarations for JavaScript interfaces

type event;
type request;
type response;

[@bs.val] external addEventListener: (string, (event) => unit) => unit = "addEventListener";

[@bs.send] external respondWith: (event, response) => unit = "respondWith";

[@bs.get] external getRequest: (event) => request = "request";

[@bs.new] external newResponse: (string) => response = "Response";


// put our code in a lexical block to avoid exporting handleRequest
{

  let handleRequest = (_request) => {
    newResponse("Hello from Reason!");
  };

  addEventListener("fetch", (event) => {
    respondWith(event, handleRequest(getRequest(event)));
  });

}
