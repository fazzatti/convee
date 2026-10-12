//! Explicit host capability: each Convee session supplies its own counter.
wit_bindgen::generate!();
struct Host;
impl Guest for Host {
    fn next() -> u32 {
        next_value()
    }
}
export!(Host);
