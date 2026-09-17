//! Provider wire formats are isolated here; consent and storage remain in the engine.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

pub const CATALOG_DATE: &str = "2026-09-17";
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Openai,
    Anthropic,
    Deepseek,
    Custom,
}
impl Provider {
    pub fn endpoint(self) -> Option<&'static str> {
        match self {
            Self::Openai => Some("https://api.openai.com/v1"),
            Self::Anthropic => Some("https://api.anthropic.com/v1"),
            Self::Deepseek => Some("https://api.deepseek.com"),
            Self::Custom => None,
        }
    }
    pub fn from_endpoint(url: &str) -> Self {
        match url.trim_end_matches('/') {
            "https://api.openai.com/v1" => Self::Openai,
            "https://api.anthropic.com/v1" => Self::Anthropic,
            "https://api.deepseek.com" | "https://api.deepseek.com/v1" => Self::Deepseek,
            _ => Self::Custom,
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub context: u32,
    pub output: u32,
}
impl Limits {
    pub fn validate(&self) -> Result<(), String> {
        if self.context < 4096
            || self.context > 2_000_000
            || self.output < 1024
            || self.output > 128_000
            || self.output >= self.context
        {
            return Err("Enter context and output limits from your model's documentation (output must be smaller than context).".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub provider: Provider,
    pub base_url: String,
    pub model: String,
    pub credential: String,
    #[serde(default)]
    pub limits: Option<Limits>,
    #[serde(default)]
    pub tested_at: Option<String>,
}
impl Profile {
    pub fn public(&self) -> Value {
        json!({"id":self.id,"name":self.name,"provider":self.provider,"baseUrl":self.base_url,"model":self.model,"limits":self.limits,"testedAt":self.tested_at})
    }
    pub fn capabilities(&self) -> Result<ModelSpec, String> {
        if let Some(spec) = catalog()
            .into_iter()
            .find(|s| s.provider == self.provider && s.id == self.model)
        {
            return Ok(spec);
        }
        let limits = self.limits.clone().ok_or("This model is unverified. Set its context and output limits in advanced connection settings first.")?;
        limits.validate()?;
        Ok(ModelSpec {
            id: self.model.clone(),
            provider: self.provider,
            limits,
            thinking: ThinkingKind::None,
            price: None,
            qualification: "unverified".into(),
        })
    }
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ThinkingKind {
    None,
    Openai,
    Anthropic,
    Deepseek,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    pub input: f64,
    pub cached: f64,
    pub output: f64,
    pub cache_write: Option<f64>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSpec {
    pub id: String,
    pub provider: Provider,
    pub limits: Limits,
    pub thinking: ThinkingKind,
    pub price: Option<Price>,
    pub qualification: String,
}
pub fn catalog() -> Vec<ModelSpec> {
    // Official sources and live qualification checklist: docs/provider-chat.md.
    vec![
        ModelSpec {
            id: "gpt-4.1-mini".into(),
            provider: Provider::Openai,
            limits: Limits {
                context: 1_047_576,
                output: 32_768,
            },
            thinking: ThinkingKind::None,
            price: Some(Price {
                input: 0.4,
                cached: 0.1,
                output: 1.6,
                cache_write: None,
            }),
            qualification: "documented; live qualification pending".into(),
        },
        ModelSpec {
            id: "gpt-5-mini".into(),
            provider: Provider::Openai,
            limits: Limits {
                context: 400_000,
                output: 128_000,
            },
            thinking: ThinkingKind::Openai,
            price: Some(Price {
                input: 0.25,
                cached: 0.025,
                output: 2.0,
                cache_write: None,
            }),
            qualification: "documented; live qualification pending".into(),
        },
        ModelSpec {
            id: "claude-haiku-4-5-20251001".into(),
            provider: Provider::Anthropic,
            limits: Limits {
                context: 200_000,
                output: 64_000,
            },
            thinking: ThinkingKind::Anthropic,
            price: Some(Price {
                input: 1.0,
                cached: 0.1,
                output: 5.0,
                cache_write: Some(1.25),
            }),
            qualification: "documented; live qualification pending".into(),
        },
        ModelSpec {
            id: "deepseek-flash".into(),
            provider: Provider::Deepseek,
            limits: Limits {
                context: 1_000_000,
                output: 128_000,
            },
            thinking: ThinkingKind::Deepseek,
            price: None,
            qualification: "documented; live qualification pending".into(),
        },
    ]
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Length {
    Brief,
    #[default]
    Standard,
    Detailed,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Thinking {
    Quick,
    #[default]
    Balanced,
    Deep,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub length: Length,
    pub thinking: Thinking,
}
impl Preferences {
    pub fn budget(&self, spec: &ModelSpec) -> u32 {
        let answer = match self.length {
            Length::Brief => 2048,
            Length::Standard => 4096,
            Length::Detailed => 8192,
        };
        let reasoning = match (spec.thinking, self.thinking) {
            (ThinkingKind::None, _) => 0,
            (ThinkingKind::Openai, Thinking::Quick) => 8192,
            (_, Thinking::Quick) => 0,
            (_, Thinking::Balanced) => 16384,
            (_, Thinking::Deep) => 32768,
        };
        (answer + reasoning).min(spec.limits.output)
    }
    fn instruction(&self) -> &'static str {
        match self.length {
            Length::Brief => "Give a brief answer.",
            Length::Standard => "Give a clear answer of moderate length.",
            Length::Detailed => "Give a detailed, well-structured answer.",
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Turn {
    pub role: String,
    pub content: String,
}
pub fn request_body(
    profile: &Profile,
    prefs: &Preferences,
    system: &str,
    turns: &[Turn],
) -> Result<Value, String> {
    let spec = profile.capabilities()?;
    let system = format!("{system}\n{}\nLive web access is unavailable. Do not claim to have checked current sources.",prefs.instruction());
    let budget = prefs.budget(&spec);
    let mut body = match profile.provider {
        Provider::Openai => {
            json!({"model":profile.model,"instructions":system,"input":turns,"max_output_tokens":budget,"store":false,"stream":false})
        }
        Provider::Anthropic => {
            json!({"model":profile.model,"system":system,"messages":turns,"max_tokens":budget,"stream":false})
        }
        _ => {
            let mut messages = vec![json!({"role":"system","content":system})];
            messages.extend(turns.iter().map(|m| json!(m)));
            json!({"model":profile.model,"messages":messages,"max_tokens":budget,"stream":false})
        }
    };
    match spec.thinking {
        ThinkingKind::Openai => {
            body["reasoning"] = json!({"effort":match prefs.thinking { Thinking::Quick=>"low",Thinking::Balanced=>"medium",Thinking::Deep=>"high" }})
        }
        ThinkingKind::Anthropic => {
            body["thinking"] = if prefs.thinking == Thinking::Quick {
                json!({"type":"disabled"})
            } else {
                json!({"type":"enabled","budget_tokens":if prefs.thinking == Thinking::Deep {32768} else {16384}})
            }
        }
        ThinkingKind::Deepseek => {
            body["thinking"] =
                json!({"type":if prefs.thinking==Thinking::Quick {"disabled"} else {"enabled"}});
            if prefs.thinking != Thinking::Quick {
                body["reasoning_effort"] = json!(if prefs.thinking == Thinking::Deep {
                    "high"
                } else {
                    "low"
                });
            }
        }
        ThinkingKind::None => (),
    }
    Ok(body)
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub input: Option<u64>,
    pub output: Option<u64>,
    pub reasoning: Option<u64>,
    pub cached: Option<u64>,
    pub cache_write: Option<u64>,
    pub estimated_usd: Option<f64>,
    pub price_date: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    pub content: String,
    pub status: String,
    pub usage: Usage,
    pub message: Option<String>,
}
impl Reply {
    pub fn failure(status: &str, message: &str) -> Self {
        Self {
            content: String::new(),
            status: status.into(),
            usage: Usage::default(),
            message: Some(message.into()),
        }
    }
}
pub fn estimate(usage: &mut Usage, spec: &ModelSpec) {
    if let (Some(input), Some(output), Some(price)) = (usage.input, usage.output, &spec.price) {
        let cached = usage.cached.unwrap_or(0).min(input);
        let write = usage.cache_write.unwrap_or(0).min(input - cached);
        usage.estimated_usd = Some(
            ((input - cached - write) as f64 * price.input
                + cached as f64 * price.cached
                + output as f64 * price.output
                + write as f64 * price.cache_write.unwrap_or(price.input))
                / 1_000_000.0,
        );
        usage.price_date = Some(CATALOG_DATE.into());
    }
}
pub fn parse_reply(provider: Provider, body: &Value) -> Reply {
    let u = &body["usage"];
    let mut usage = Usage::default();
    let mut refused = false;
    let (text, status) = match provider {
        Provider::Openai => {
            let mut text = String::new();
            if let Some(items) = body["output"].as_array() {
                for item in items {
                    if item["type"] == "message" {
                        if let Some(blocks) = item["content"].as_array() {
                            for block in blocks {
                                if block["type"] == "output_text" {
                                    text.push_str(block["text"].as_str().unwrap_or_default());
                                }
                                if block["type"] == "refusal" {
                                    refused = true;
                                }
                            }
                        }
                    }
                }
            }
            usage.input = u["input_tokens"].as_u64();
            usage.output = u["output_tokens"].as_u64();
            usage.reasoning = u["output_tokens_details"]["reasoning_tokens"].as_u64();
            usage.cached = u["input_tokens_details"]["cached_tokens"].as_u64();
            let status = if body["status"] == "incomplete"
                && body["incomplete_details"]["reason"] == "max_output_tokens"
            {
                "truncated"
            } else if body["status"] == "completed" {
                "complete"
            } else {
                "failed"
            };
            (text, status)
        }
        Provider::Anthropic => {
            let text = body["content"]
                .as_array()
                .map(|blocks| {
                    blocks
                        .iter()
                        .filter(|b| b["type"] == "text")
                        .filter_map(|b| b["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            usage.cached = u["cache_read_input_tokens"].as_u64();
            usage.cache_write = u["cache_creation_input_tokens"].as_u64();
            usage.input = u["input_tokens"].as_u64().map(|v| {
                v.saturating_add(usage.cached.unwrap_or(0))
                    .saturating_add(usage.cache_write.unwrap_or(0))
            });
            usage.output = u["output_tokens"].as_u64();
            refused = body["stop_reason"] == "refusal";
            let status = match body["stop_reason"].as_str() {
                Some("max_tokens" | "model_context_window_exceeded") => "truncated",
                Some("end_turn" | "stop_sequence") => "complete",
                _ => "failed",
            };
            (text, status)
        }
        _ => {
            let c = &body["choices"][0];
            refused = c["finish_reason"] == "content_filter"
                || c["message"]["refusal"]
                    .as_str()
                    .is_some_and(|s| !s.is_empty());
            usage.input = u["prompt_tokens"].as_u64();
            usage.output = u["completion_tokens"].as_u64();
            usage.reasoning = u["completion_tokens_details"]["reasoning_tokens"].as_u64();
            usage.cached = u["prompt_cache_hit_tokens"]
                .as_u64()
                .or_else(|| u["prompt_tokens_details"]["cached_tokens"].as_u64());
            (
                c["message"]["content"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
                match c["finish_reason"].as_str() {
                    Some("length") => "truncated",
                    Some("stop") => "complete",
                    _ => "failed",
                },
            )
        }
    };
    let status = if refused {
        "refused"
    } else if text.trim().is_empty() && status == "complete" {
        "failed"
    } else {
        status
    };
    let message=match status {"truncated" if text.trim().is_empty()=>Some("The model used its response allowance before answering. Choose Quick thinking or Detailed answers, then retry (may cost)."),"truncated"=>Some("Response limit reached. Continue to request more (may cost)."),"refused"=>Some("The provider declined this request."),"failed"=>Some("The provider returned no usable answer or an unsupported response. Check the selected model's settings."),_=>None};
    Reply {
        content: if refused { String::new() } else { text },
        status: status.into(),
        usage,
        message: message.map(str::to_owned),
    }
}
pub fn http_error(status: u16) -> &'static str {
    match status {
        401 => "Authentication failed. Update this connection's API key.",
        402 => "Insufficient API balance. Check your provider account.",
        403 => "Your account cannot access this model.",
        404 => "Model or endpoint unavailable. Check this connection.",
        400 | 422 => {
            "Provider rejected these settings. Check the model and its supported parameters."
        }
        429 => "Provider rate or usage limit reached. Check your account and retry later.",
        500..=599 => "Provider temporarily unavailable. Retry later.",
        _ => "Provider request failed. Check the connection settings.",
    }
}
fn authenticated(
    client: &reqwest::Client,
    profile: &Profile,
    key: &str,
    url: &str,
    get: bool,
) -> reqwest::RequestBuilder {
    let request = if get {
        client.get(url)
    } else {
        client.post(url)
    };
    if profile.provider == Provider::Anthropic {
        request
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
    } else {
        request.bearer_auth(key)
    }
}
async fn bounded_json(mut response: reqwest::Response) -> Result<Value, String> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Provider response interrupted. Usage may be unknown.")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("Provider response exceeded the safety size limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Provider returned invalid JSON.".into())
}
pub async fn send(profile: &Profile, key: &str, body: Value, cancel: Arc<AtomicBool>) -> Reply {
    let future = async {
        let client = reqwest::Client::builder()
            .https_only(!cfg!(test))
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|_| "Cannot create provider connection.".to_string())?;
        let path = match profile.provider {
            Provider::Openai => "responses",
            Provider::Anthropic => "messages",
            _ => "chat/completions",
        };
        let response = authenticated(
            &client,
            profile,
            key,
            &format!("{}/{path}", profile.base_url.trim_end_matches('/')),
            false,
        )
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Provider timed out. It may have processed the request; usage is unknown."
                    .to_string()
            } else {
                "Network request failed. Usage may be unknown; retry only when ready.".to_string()
            }
        })?;
        if !response.status().is_success() {
            return Err(http_error(response.status().as_u16()).into());
        }
        let value = bounded_json(response).await?;
        let mut reply = parse_reply(profile.provider, &value);
        if let Ok(spec) = profile.capabilities() {
            estimate(&mut reply.usage, &spec);
        }
        Ok::<Reply, String>(reply)
    };
    tokio::select! {
        result=future=>result.unwrap_or_else(|e|Reply::failure("failed",&e)),
        _=async {loop {if cancel.load(Ordering::SeqCst) {break;} tokio::time::sleep(Duration::from_millis(40)).await;}}=>Reply::failure("cancelled","Stopped receiving the response. The provider may still charge; usage is unknown."),
    }
}
pub async fn discover(profile: &Profile, key: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Cannot connect to provider.")?;
    let response = authenticated(
        &client,
        profile,
        key,
        &format!("{}/models", profile.base_url.trim_end_matches('/')),
        true,
    )
    .send()
    .await
    .map_err(|_| {
        "Model list unavailable. You can still select a documented model or enter an identifier."
    })?;
    if !response.status().is_success() {
        return Err(http_error(response.status().as_u16()).into());
    }
    let value = bounded_json(response).await?;
    Ok(value["data"]
        .as_array()
        .ok_or("Provider returned no model list.")?
        .iter()
        .filter_map(|v| v["id"].as_str())
        .filter(|s| s.len() <= 200 && !s.chars().any(char::is_control))
        .take(1000)
        .map(str::to_owned)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    pub fn profile(provider: Provider) -> Profile {
        let model = catalog()
            .into_iter()
            .find(|s| s.provider == provider)
            .map(|s| s.id)
            .unwrap_or("custom-model".into());
        Profile {
            id: "fixture".into(),
            name: "Fixture".into(),
            provider,
            base_url: provider
                .endpoint()
                .unwrap_or("https://example.com/v1")
                .into(),
            model,
            credential: "fixture-only".into(),
            limits: Some(Limits {
                context: 32768,
                output: 8192,
            }),
            tested_at: None,
        }
    }
    #[test]
    fn adapters_use_native_formats_and_leave_room_for_visible_answers() {
        let turns = [Turn {
            role: "user".into(),
            content: "Explain something complicated".into(),
        }];
        for spec in catalog() {
            for length in [Length::Brief, Length::Standard, Length::Detailed] {
                for thinking in [Thinking::Quick, Thinking::Balanced, Thinking::Deep] {
                    let mut p = profile(spec.provider);
                    p.model = spec.id.clone();
                    let prefs = Preferences { length, thinking };
                    let b = request_body(&p, &prefs, "Boundaries", &turns).unwrap();
                    assert!(prefs.budget(&spec) <= spec.limits.output);
                    match spec.provider {
                        Provider::Openai => {
                            assert_eq!(b["input"][0]["content"], turns[0].content);
                            assert_eq!(b["store"], false);
                            assert!(b.get("messages").is_none());
                            if spec.thinking == ThinkingKind::None {
                                assert!(b.get("reasoning").is_none());
                            }
                        }
                        Provider::Anthropic => {
                            assert!(b["system"].as_str().unwrap().contains("Boundaries"));
                            if thinking != Thinking::Quick {
                                assert!(
                                    b["max_tokens"].as_u64().unwrap()
                                        > b["thinking"]["budget_tokens"].as_u64().unwrap()
                                );
                            }
                        }
                        Provider::Deepseek => {
                            assert_eq!(
                                b["thinking"]["type"],
                                if thinking == Thinking::Quick {
                                    "disabled"
                                } else {
                                    "enabled"
                                }
                            );
                            assert_eq!(b["messages"][1]["content"], turns[0].content);
                        }
                        _ => unreachable!(),
                    }
                }
            }
        }
        let b = request_body(
            &profile(Provider::Custom),
            &Preferences::default(),
            "test",
            &turns,
        )
        .unwrap();
        assert!(b.get("thinking").is_none());
        assert!(b.get("reasoning").is_none());
    }
    #[test]
    fn parses_text_without_exposing_reasoning_and_detects_truncation() {
        let fixtures = [
            (
                Provider::Openai,
                json!({"status":"completed","output":[{"type":"reasoning","text":"private-reasoning"},{"type":"message","content":[{"type":"output_text","text":"Answer"}]}],"usage":{"input_tokens":10,"output_tokens":30,"output_tokens_details":{"reasoning_tokens":20}}}),
                "complete",
                "Answer",
            ),
            (
                Provider::Anthropic,
                json!({"stop_reason":"max_tokens","content":[{"type":"thinking","thinking":"private-reasoning"},{"type":"text","text":"Partial"}],"usage":{"input_tokens":10,"cache_read_input_tokens":5,"cache_creation_input_tokens":2,"output_tokens":8}}),
                "truncated",
                "Partial",
            ),
            (
                Provider::Deepseek,
                json!({"choices":[{"finish_reason":"length","message":{"content":"","reasoning_content":"private-reasoning"}}],"usage":{"prompt_tokens":20,"completion_tokens":512}}),
                "truncated",
                "",
            ),
            (
                Provider::Custom,
                json!({"choices":[{"finish_reason":"stop","message":{"content":"Answer"}}]}),
                "complete",
                "Answer",
            ),
            (
                Provider::Anthropic,
                json!({"stop_reason":"refusal","content":[]}),
                "refused",
                "",
            ),
            (
                Provider::Openai,
                json!({"status":"completed","output":[{"type":"message","content":[{"type":"refusal","refusal":"private-reasoning"}]}]}),
                "refused",
                "",
            ),
            (
                Provider::Openai,
                json!({"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[]}),
                "truncated",
                "",
            ),
            (
                Provider::Deepseek,
                json!({"choices":[{"finish_reason":"stop","message":{"content":null}}]}),
                "failed",
                "",
            ),
        ];
        for (provider, value, status, text) in fixtures {
            let reply = parse_reply(provider, &value);
            assert_eq!(reply.status, status);
            assert_eq!(reply.content, text);
            assert!(!serde_json::to_string(&reply)
                .unwrap()
                .contains("private-reasoning"));
        }
    }
    #[test]
    fn usage_does_not_double_count_reasoning_or_cached_tokens() {
        let spec = catalog().remove(0);
        let mut usage = Usage {
            input: Some(1000),
            cached: Some(400),
            output: Some(200),
            reasoning: Some(150),
            ..Usage::default()
        };
        estimate(&mut usage, &spec);
        assert!((usage.estimated_usd.unwrap() - 0.0006).abs() < 1e-10);
        let mut absent = Usage::default();
        estimate(&mut absent, &spec);
        assert!(absent.estimated_usd.is_none());
        let mut claude=parse_reply(Provider::Anthropic,&json!({"stop_reason":"end_turn","content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":100,"cache_read_input_tokens":200,"cache_creation_input_tokens":300,"output_tokens":10}})).usage;
        estimate(&mut claude, &catalog()[2]);
        assert_eq!(claude.input, Some(600));
        assert!((claude.estimated_usd.unwrap() - 0.000545).abs() < 1e-10);
    }
    #[test]
    fn migrated_endpoints_are_matched_exactly_and_unknown_models_need_limits() {
        assert_eq!(
            Provider::from_endpoint("https://api.deepseek.com/v1"),
            Provider::Deepseek
        );
        assert_eq!(
            Provider::from_endpoint("https://api.deepseek.com.evil.example"),
            Provider::Custom
        );
        let mut p = profile(Provider::Custom);
        p.limits = None;
        assert!(p.capabilities().is_err());
        p.limits = Some(Limits {
            context: 4096,
            output: 8192,
        });
        assert!(p.capabilities().is_err());
    }
    #[test]
    fn transport_sends_correct_auth_and_does_not_follow_redirects() {
        use std::{
            io::{Read, Write},
            net::TcpListener,
        };
        for provider in [
            Provider::Openai,
            Provider::Anthropic,
            Provider::Deepseek,
            Provider::Custom,
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let mut p = profile(provider);
            p.base_url = format!("http://{}", listener.local_addr().unwrap());
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut data = vec![];
                let mut buffer = [0; 4096];
                loop {
                    let n = stream.read(&mut buffer).unwrap();
                    data.extend_from_slice(&buffer[..n]);
                    if data.windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                }
                let headers = String::from_utf8_lossy(&data).to_lowercase();
                if provider == Provider::Anthropic {
                    assert!(headers.contains("x-api-key: fixture-key"));
                    assert!(headers.contains("anthropic-version: 2023-06-01"));
                    assert!(headers.contains("post /messages"));
                    assert!(!headers.contains("authorization:"));
                } else {
                    assert!(headers.contains("authorization: bearer fixture-key"));
                    assert!(headers.contains(if provider == Provider::Openai {
                        "post /responses"
                    } else {
                        "post /chat/completions"
                    }));
                }
                write!(stream,"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/stolen\r\nContent-Length: 19\r\nConnection: close\r\n\r\nsecret-error-detail").unwrap();
            });
            let result = tauri::async_runtime::block_on(send(
                &p,
                "fixture-key",
                json!({}),
                Arc::new(AtomicBool::new(false)),
            ));
            assert_eq!(result.status, "failed");
            assert!(!serde_json::to_string(&result)
                .unwrap()
                .contains("secret-error-detail"));
            server.join().unwrap();
        }
    }
    #[test]
    fn cancellation_drops_waiting_response_promptly() {
        use std::{io::Read, net::TcpListener};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let mut p = profile(Provider::Deepseek);
        p.base_url = format!("http://{}", listener.local_addr().unwrap());
        let cancel = Arc::new(AtomicBool::new(false));
        let signal = cancel.clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut data = [0; 4096];
            let _ = stream.read(&mut data);
            signal.store(true, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(300));
        });
        let result = tauri::async_runtime::block_on(send(&p, "fixture-key", json!({}), cancel));
        assert_eq!(result.status, "cancelled");
        assert!(result.usage.input.is_none());
        server.join().unwrap();
    }
}
