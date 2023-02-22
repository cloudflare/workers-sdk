import 'package:js/js.dart';

@JS()
class Request {
}

@JS()
class Response {
  external factory Response(String body);
}

@JS()
class FetchEvent {
  external Request get request;
  external void respondWith(Response r);
}

@JS()
external void addEventListener(String type, void Function(FetchEvent event));

void main() {
  addEventListener('fetch', allowInterop((FetchEvent event) {
    event.respondWith(handleRequest(event.request));
  }));
}

Response handleRequest(Request request) {
  return new Response("Dart Worker hello world!");
}
