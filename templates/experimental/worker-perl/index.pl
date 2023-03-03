sub listener {
    my ($event) = @_;
    my $req = $event->request;
    my $resp = handleRequest($req);
    $event->respondWith($resp);
}

sub handleRequest {
    my ($request) = @_;
    my $msg = "Perl Worker hello world";
    return Response->new($msg);
}

JS::inline('addEventListener("fetch", event => { p5cget("main", "listener")([event]) })');
