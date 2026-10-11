//! Small real guest used by the Convee integration and runtime suites.
use std::cell::Cell;

wit_bindgen::generate!();
struct Text;
thread_local! { static COUNT: Cell<u32> = const { Cell::new(0) }; }

impl Guest for Text {
    fn count_words(text: String) -> u32 {
        text.split_whitespace().count() as u32
    }
    fn summarize(text: String) -> Result<Summary, Failure> {
        if text.trim().is_empty() {
            return Err(Failure::Empty);
        }
        if text.len() > 4096 {
            return Err(Failure::TooLong(text.len() as u32));
        }
        Ok(Summary {
            words: Self::count_words(text.clone()),
            title: text.lines().next().unwrap_or_default().trim().to_owned(),
        })
    }
    fn echo_bytes(bytes: Vec<u8>) -> Vec<u8> {
        bytes
    }
    fn echo_wide(value: u64) -> u64 {
        value
    }
    fn optional_title(text: Option<String>) -> Option<String> {
        text.map(|value| value.trim().to_owned())
    }
    fn increment() -> u32 {
        COUNT.with(|count| {
            count.set(count.get() + 1);
            count.get()
        })
    }
    fn trap() {
        panic!("intentional guest trap");
    }
}

export!(Text);
