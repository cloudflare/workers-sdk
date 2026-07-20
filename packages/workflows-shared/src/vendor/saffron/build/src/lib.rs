use chrono::{TimeZone, Utc};
use saffron::Cron;
use wasm_bindgen::prelude::*;

/// Thin wasm-bindgen wrapper around the public `saffron` cron parser. The
/// request/response shaping lives in JS (see the CronFetcher WorkerEntrypoint);
/// this exposes only expression parsing and next-occurrence computation.
#[wasm_bindgen]
pub struct WasmCron {
    inner: Cron,
}

#[wasm_bindgen]
impl WasmCron {
    #[wasm_bindgen(constructor)]
    pub fn new(expression: &str) -> Result<WasmCron, JsValue> {
        expression
            .parse::<Cron>()
            .map(|inner| WasmCron { inner })
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Next occurrence strictly after `after_ms` (epoch ms), or undefined.
    #[wasm_bindgen(js_name = nextAfter)]
    pub fn next_after(&self, after_ms: f64) -> Option<f64> {
        let start = Utc.timestamp_millis_opt(after_ms as i64).single()?;
        self.inner
            .next_after(start)
            .map(|next| next.timestamp_millis() as f64)
    }
}
