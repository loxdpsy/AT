// A small JSON reader with no dependencies. It is enough for the GitHub API responses this tool reads.

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    Str(String),
    Array(Vec<Value>),
    Object(Vec<(String, Value)>),
}

impl Value {
    /// The value of a key in an object, or None.
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Object(pairs) => pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Array(items) => Some(items),
            _ => None,
        }
    }
}

/// A JSON string literal: the text in quotes, with the characters that must be escaped.
pub fn quote(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub fn parse(text: &str) -> Result<Value, String> {
    let mut parser = Parser { bytes: text.as_bytes(), pos: 0 };
    let value = parser.value()?;
    parser.skip_ws();
    if parser.pos != parser.bytes.len() {
        return Err(format!("unexpected text after the JSON value (byte {})", parser.pos));
    }
    Ok(value)
}

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn skip_ws(&mut self) {
        while self.pos < self.bytes.len() && matches!(self.bytes[self.pos], b' ' | b'\t' | b'\n' | b'\r') {
            self.pos += 1;
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn expect(&mut self, byte: u8) -> Result<(), String> {
        self.skip_ws();
        if self.peek() == Some(byte) {
            self.pos += 1;
            Ok(())
        } else {
            Err(format!("expected '{}' at byte {}", byte as char, self.pos))
        }
    }

    fn literal(&mut self, word: &str, value: Value) -> Result<Value, String> {
        if self.bytes[self.pos..].starts_with(word.as_bytes()) {
            self.pos += word.len();
            Ok(value)
        } else {
            Err(format!("unknown word at byte {}", self.pos))
        }
    }

    fn value(&mut self) -> Result<Value, String> {
        self.skip_ws();
        match self.peek() {
            None => Err("unexpected end of JSON".to_string()),
            Some(b'{') => self.object(),
            Some(b'[') => self.array(),
            Some(b'"') => Ok(Value::Str(self.string()?)),
            Some(b't') => self.literal("true", Value::Bool(true)),
            Some(b'f') => self.literal("false", Value::Bool(false)),
            Some(b'n') => self.literal("null", Value::Null),
            Some(_) => self.number(),
        }
    }

    fn object(&mut self) -> Result<Value, String> {
        self.expect(b'{')?;
        let mut pairs: Vec<(String, Value)> = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(Value::Object(pairs));
        }
        loop {
            let key = self.string()?;
            self.expect(b':')?;
            let value = self.value()?;
            pairs.push((key, value));
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(Value::Object(pairs));
                }
                _ => return Err(format!("expected ',' or '}}' at byte {}", self.pos)),
            }
        }
    }

    fn array(&mut self) -> Result<Value, String> {
        self.expect(b'[')?;
        let mut items: Vec<Value> = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(Value::Array(items));
        }
        loop {
            items.push(self.value()?);
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    return Ok(Value::Array(items));
                }
                _ => return Err(format!("expected ',' or ']' at byte {}", self.pos)),
            }
        }
    }

    fn string(&mut self) -> Result<String, String> {
        self.expect(b'"')?;
        let mut out: Vec<u8> = Vec::new();
        loop {
            let byte = match self.peek() {
                Some(b) => b,
                None => return Err("unterminated string".to_string()),
            };
            self.pos += 1;
            match byte {
                b'"' => break,
                b'\\' => {
                    let esc = match self.peek() {
                        Some(e) => e,
                        None => return Err("unterminated escape".to_string()),
                    };
                    self.pos += 1;
                    match esc {
                        b'"' => out.push(b'"'),
                        b'\\' => out.push(b'\\'),
                        b'/' => out.push(b'/'),
                        b'b' => out.push(8),
                        b'f' => out.push(12),
                        b'n' => out.push(b'\n'),
                        b'r' => out.push(b'\r'),
                        b't' => out.push(b'\t'),
                        b'u' => {
                            let mut code = self.hex4()?;
                            if (0xD800..0xDC00).contains(&code) {
                                // A surrogate pair, for example \uD83D\uDE00.
                                if self.bytes.get(self.pos) != Some(&b'\\') || self.bytes.get(self.pos + 1) != Some(&b'u') {
                                    return Err("lone surrogate in a JSON string".to_string());
                                }
                                self.pos += 2;
                                let low = self.hex4()?;
                                if !(0xDC00..0xE000).contains(&low) {
                                    return Err("bad surrogate pair in a JSON string".to_string());
                                }
                                code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                            }
                            let ch = match char::from_u32(code) {
                                Some(c) => c,
                                None => return Err("bad unicode escape".to_string()),
                            };
                            let mut buf = [0u8; 4];
                            out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                        }
                        _ => return Err(format!("bad escape at byte {}", self.pos)),
                    }
                }
                _ => out.push(byte),
            }
        }
        String::from_utf8(out).map_err(|_| "a JSON string is not UTF-8".to_string())
    }

    fn hex4(&mut self) -> Result<u32, String> {
        if self.pos + 4 > self.bytes.len() {
            return Err("short unicode escape".to_string());
        }
        let text = std::str::from_utf8(&self.bytes[self.pos..self.pos + 4]).map_err(|_| "bad unicode escape".to_string())?;
        let code = u32::from_str_radix(text, 16).map_err(|_| "bad unicode escape".to_string())?;
        self.pos += 4;
        Ok(code)
    }

    fn number(&mut self) -> Result<Value, String> {
        let start = self.pos;
        while self.pos < self.bytes.len() && matches!(self.bytes[self.pos], b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E') {
            self.pos += 1;
        }
        let text = std::str::from_utf8(&self.bytes[start..self.pos]).map_err(|_| "bad number".to_string())?;
        match text.parse::<f64>() {
            Ok(n) => Ok(Value::Number(n)),
            Err(_) => Err(format!("unexpected text at byte {}", start)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_objects_arrays_and_strings() {
        let v = parse(r#"{"tag_name":"v0.0.2.1","assets":[{"name":"a.zip","size":12,"ok":true,"x":null}]}"#).unwrap();
        assert_eq!(v.get("tag_name").and_then(|t| t.as_str()), Some("v0.0.2.1"));
        let assets = v.get("assets").and_then(|a| a.as_array()).unwrap();
        assert_eq!(assets[0].get("name").and_then(|n| n.as_str()), Some("a.zip"));
        assert_eq!(assets[0].get("size"), Some(&Value::Number(12.0)));
    }

    #[test]
    fn reads_escapes_and_surrogate_pairs() {
        let v = parse(r#"{"s":"line\nquote\" slash\/ \u00e9 \uD83D\uDE00"}"#).unwrap();
        assert_eq!(v.get("s").and_then(|s| s.as_str()), Some("line\nquote\" slash/ \u{e9} \u{1F600}"));
    }

    #[test]
    fn accepts_crlf_whitespace() {
        let v = parse("{\r\n  \"name\": \"Atlas Translation\"\r\n}\r\n").unwrap();
        assert_eq!(v.get("name").and_then(|s| s.as_str()), Some("Atlas Translation"));
    }

    #[test]
    fn quote_escapes_and_round_trips() {
        let text = "C:\\Atlas \"x\"\nline\u{1}";
        assert_eq!(quote(text), "\"C:\\\\Atlas \\\"x\\\"\\nline\\u0001\"");
        assert_eq!(parse(&quote(text)).unwrap().as_str(), Some(text));
    }

    #[test]
    fn rejects_broken_json() {
        assert!(parse("{\"a\":").is_err());
        assert!(parse("{\"a\" 1}").is_err());
        assert!(parse("[1,2] extra").is_err());
        assert!(parse("").is_err());
    }
}
