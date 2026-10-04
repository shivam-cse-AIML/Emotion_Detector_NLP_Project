/* ==========================================================
   Emotion Detector – frontend logic
   Talks to the FastAPI backend: POST /predict  { "text": "..." }
   ========================================================== */

"use strict";

// ---------- Configuration ----------
const API_BASE = "https://emotion-detector-nlp-project.onrender.com";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_HISTORY = 5;

// Display details for the six emotions the backend can return
const EMOTIONS = {
  sadness:  { emoji: "😢", blurb: "The text carries sorrow, loss or disappointment." },
  anger:    { emoji: "😠", blurb: "The text expresses frustration, irritation or rage." },
  love:     { emoji: "❤️", blurb: "The text shows affection, care or warmth toward someone." },
  surprise: { emoji: "😮", blurb: "The text reflects something unexpected or astonishing." },
  fear:     { emoji: "😨", blurb: "The text conveys worry, anxiety or a sense of threat." },
  joy:      { emoji: "😄", blurb: "The text is happy, upbeat and full of positive energy." },
};

// ---------- DOM references ----------
const $ = (id) => document.getElementById(id);

const form        = $("predict-form");
const textInput   = $("text");
const fieldError  = $("field-error");
const charCount   = $("char-count");
const submitBtn   = $("submit-btn");
const btnLabel    = $("btn-label");
const clearBtn    = $("clear-btn");
const retryBtn    = $("retry-btn");
const output      = $("output");
const statusPill  = $("api-status");
const statusText  = $("api-status-text");
const historyBox  = $("history");
const historyList = $("history-list");

const history = [];
let isLoading = false;

$("api-base-label").textContent = API_BASE;

// ---------- Small helpers ----------
class ApiError extends Error {
  constructor(title, message, details = []) {
    super(message);
    this.title = title;
    this.details = details;
  }
}

function setState(state) {
  output.dataset.state = state;
  output.querySelectorAll("[data-for]").forEach((el) => {
    el.hidden = el.dataset.for !== state;
  });
}

function setEmotionTheme(emotion) {
  document.body.dataset.emotion = emotion && EMOTIONS[emotion] ? emotion : "none";
}

function setLoading(on) {
  isLoading = on;
  submitBtn.disabled = on;
  submitBtn.classList.toggle("is-loading", on);
  btnLabel.textContent = on ? "Analysing…" : "Detect emotion";
}

function showFieldError(message) {
  fieldError.textContent = message;
  textInput.setAttribute("aria-invalid", message ? "true" : "false");
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function updateCount() {
  const n = textInput.value.length;
  charCount.textContent = `${n} character${n === 1 ? "" : "s"}`;
}

// ---------- API status indicator ----------
function setApiStatus(state) {
  statusPill.dataset.state = state;
  statusText.textContent =
    state === "online" ? "API online" :
    state === "offline" ? "API offline" : "Checking API…";
}

async function checkApi() {
  setApiStatus("checking");
  try {
    const res = await fetchWithTimeout(`${API_BASE}/`, {}, 5000);
    setApiStatus(res.ok ? "online" : "offline");
  } catch {
    setApiStatus("offline");
  }
}

// ---------- Networking ----------
async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Turn any failed HTTP response into a readable ApiError
async function buildHttpError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* response was not JSON */ }
  const detail = body && body.detail;

  // 422 – FastAPI/Pydantic validation: detail is a list of {loc, msg, type}
  if (res.status === 422 && Array.isArray(detail)) {
    const items = detail.map((d) => {
      const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== "body").join(".") : "";
      return field ? `${field}: ${d.msg}` : d.msg;
    });
    return new ApiError(
      "Invalid input",
      "The server rejected the request. Please fix the following:",
      items
    );
  }

  // 400 / 500 – backend sends a plain string in `detail`
  if (typeof detail === "string") {
    if (res.status === 400) return new ApiError("Invalid input", detail);
    if (res.status >= 500) return new ApiError("Prediction failed", detail);
    return new ApiError(`Request failed (${res.status})`, detail);
  }

  if (res.status >= 500) {
    return new ApiError("Server error", "The server hit a problem while predicting. Check the uvicorn terminal for details.");
  }
  return new ApiError(`Request failed (${res.status})`, "The server returned an unexpected response.");
}

async function predictEmotion(text) {
  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError(
        "Request timed out",
        `The server did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds. Try again in a moment.`
      );
    }
    throw new ApiError(
      "Cannot reach the API",
      `Could not connect to ${API_BASE}. Make sure the backend is running with: uvicorn NLP:app --reload`
    );
  }

  if (!res.ok) throw await buildHttpError(res);

  try {
    return await res.json();
  } catch {
    throw new ApiError("Unexpected response", "The server replied with data this page could not read.");
  }
}

// ---------- Rendering ----------
function renderResult(data, elapsedMs) {
  const key = String(data.emotion || "").toLowerCase();
  const info = EMOTIONS[key];

  setEmotionTheme(info ? key : null);

  $("result-emoji").textContent = info ? info.emoji : "🤔";
  $("result-emotion").textContent = capitalise(data.emotion || "Unknown");
  $("result-blurb").textContent = info
    ? info.blurb
    : "The model returned a label this page does not have a description for.";
  $("result-text").textContent = data.text ?? "";
  $("result-class").textContent = data.prediction ?? "–";
  $("result-time").textContent = `${Math.round(elapsedMs)} ms`;

  setState("result");
}

function renderError(err) {
  setEmotionTheme(null);
  $("error-title").textContent = err.title || "Something went wrong";
  $("error-message").textContent = err.message || "Please try again.";

  const list = $("error-list");
  list.innerHTML = "";
  (err.details || []).forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    list.appendChild(li);
  });
  list.hidden = !(err.details && err.details.length);

  setState("error");
}

function addToHistory(text, emotion) {
  history.unshift({ text, emotion });
  if (history.length > MAX_HISTORY) history.pop();

  const colours = {
    sadness: "#3f7bd8", anger: "#dc4040", love: "#d9468f",
    surprise: "#14a89c", fear: "#7a56d3", joy: "#e8a400",
  };

  historyList.innerHTML = "";
  history.forEach((item) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Load this text again";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.setProperty("--c", colours[item.emotion] || "#4a4fe0");

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.emotion;

    const snippet = document.createElement("span");
    snippet.className = "snippet";
    snippet.textContent = item.text;

    btn.append(dot, name, snippet);
    btn.addEventListener("click", () => {
      textInput.value = item.text;
      updateCount();
      showFieldError("");
      textInput.focus();
    });

    li.appendChild(btn);
    historyList.appendChild(li);
  });

  historyBox.hidden = false;
}

// ---------- Form handling ----------
function validate(text) {
  if (!text.trim()) return "Enter some text before running the prediction.";
  return "";
}

async function handleSubmit(event) {
  if (event) event.preventDefault();
  if (isLoading) return;

  const text = textInput.value;
  const problem = validate(text);
  showFieldError(problem);
  if (problem) {
    textInput.focus();
    return;
  }

  setLoading(true);
  setState("loading");

  const started = performance.now();
  try {
    const data = await predictEmotion(text);
    renderResult(data, performance.now() - started);
    addToHistory(text.trim(), String(data.emotion || "unknown").toLowerCase());
    setApiStatus("online");
  } catch (err) {
    renderError(err instanceof ApiError ? err : new ApiError("Something went wrong", String(err)));
    if (err.title === "Cannot reach the API" || err.title === "Request timed out") {
      setApiStatus("offline");
    }
  } finally {
    setLoading(false);
  }
}

function resetForm() {
  textInput.value = "";
  updateCount();
  showFieldError("");
  setEmotionTheme(null);
  setState("idle");
  textInput.focus();
}

// ---------- Events ----------
form.addEventListener("submit", handleSubmit);

textInput.addEventListener("input", () => {
  updateCount();
  if (fieldError.textContent) showFieldError("");
});

textInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit();
});

clearBtn.addEventListener("click", resetForm);

retryBtn.addEventListener("click", () => {
  checkApi();
  handleSubmit();
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    textInput.value = chip.dataset.text;
    updateCount();
    showFieldError("");
    textInput.focus();
  });
});

// ---------- Init ----------
updateCount();
setState("idle");
checkApi();
