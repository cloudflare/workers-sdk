           IDENTIFICATION DIVISION.
           PROGRAM-ID. worker.
           PROCEDURE DIVISION.
           CALL "set_http_status" USING "200".
           CALL "set_http_body" USING "Hello world"
           STOP RUN.
