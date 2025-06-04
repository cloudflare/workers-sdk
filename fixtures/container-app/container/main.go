package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

func handler(w http.ResponseWriter, r *http.Request) {
	country := os.Getenv("CLOUDFLARE_COUNTRY_A2")
	location := os.Getenv("CLOUDFLARE_LOCATION")
	region := os.Getenv("CLOUDFLARE_REGION")

	fmt.Fprintf(w, "Hi, I'm a container running in %s, %s, which is part of %s ", location, country, region)
}

func main() {
	c := make(chan os.Signal, 10)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	terminate := false
	go func() {
		for range c {
			if terminate {
				os.Exit(0)
				continue
			}

			terminate = true
			go func() {
				time.Sleep(time.Minute)
				os.Exit(0)
			}()
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/_health", func(w http.ResponseWriter, r *http.Request) {
		if terminate {
			w.WriteHeader(400)
			w.Write([]byte("draining"))
			return
		}

		w.Write([]byte("ok"))
	})

	mux.HandleFunc("/protocol", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Request Protocol: %s\n", r.Proto)
	})

	mux.HandleFunc("/", handler)

	server := &http.Server{
		Addr:    "0.0.0.0:8080",
		Handler: h2c.NewHandler(mux, &http2.Server{}),
	}

	log.Fatal(server.ListenAndServe())
}
