<?php

addEventListener("fetch", function ($event) {
    $event->respondWith(handleRequest($event->request));
});

function handleRequest($request) {
    return new Response("PHP Worker hello world", [
        "headers" => [ "content-type" => "text/plain" ]
    ]);
}