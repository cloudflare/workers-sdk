use serde_json::json;
use worker::*;

mod utils;

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
    utils::log_request(&req);
    utils::set_panic_hook();

    let router = Router::new();
    router
        .get("/", |_, _| Response::ok("Hello from Workers!"))
        .get_async("/query", |_, ctx| async move {
            use libsql_client::{workers::Client, DatabaseClient, params};
            use std::convert::TryFrom;

            let client = match Client::from_ctx(&ctx) {
                Ok(client) => client,
                Err(e) => return Response::error(e.to_string(), 500),
            };

            let stmt_result = match client.execute("select * from example_users").await {
                Ok(result) => result,
                Err(e) => return Response::error(e.to_string(), 500),
            };

            let s = client.execute("select * from example_users").await?;

            let x = &stmt_result.rows[0][0];
            let message = String::try_from(x.clone()).unwrap_or("2".to_string());
            // match x.to_string() {
            // }
            console_log!("Message: {message}");

            // let s = match x {
            //     Some(Value::String { value: s }) => s
            // }

            // let y: String::try_from(x);
            // let message = match stmt_result {
            //     Ok(ResultSet { columns: _, rows }) => {
            //         let value = &rows.first().expect("expected one row").cells["email"];
            //         String::try_from(value.clone()).unwrap_or_default()
            //     }
            //     Err(e) => return Response::error(e.to_string(), 400),
            // };

            // Generate the successful response via Workers API
            // let message = "asdf";
            Response::ok(format!("Message: {message}"))
        })
        .run(req, env)
        .await
}
