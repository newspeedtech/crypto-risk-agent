import { AgentClient } from "agents/client";
import type { AgentState } from "../types";

const statusEl = document.getElementById("status")!;
const reportEl = document.getElementById("report")!;
const connEl = document.getElementById("conn")!;
const findingsInputEl = document.getElementById("findingsInput") as HTMLTextAreaElement;

// Restore the last-submitted CBOM into the textarea only once, from the
// initial state sync on page load/refresh — matching how the report
// already persists. Skipping this on later updates (e.g. analysis
// finishing in the background) means it won't stomp on whatever the user
// is actively typing after submitting.
let hasRestoredInput = false;

function render(state: AgentState | undefined) {
  if (!state) return;
  statusEl.textContent = state.status;
  if (state.status === "error") {
    reportEl.textContent = `Error: ${state.errorMessage}`;
  } else if (state.report) {
    reportEl.textContent = state.report;
  } else {
    reportEl.textContent = "No report yet.";
  }

  if (!hasRestoredInput) {
    hasRestoredInput = true;
    if (state.cbomInput) {
      findingsInputEl.value = state.cbomInput;
    }
  }
}

let client: AgentClient<unknown, AgentState> | undefined;

try {
  client = new AgentClient<unknown, AgentState>({
    agent: "CryptoRiskAgent",
    name: "default-session", // fixed session id for this single-user scaffold
    host: window.location.host, // same origin — Worker serves both the UI and the WS route
    onStateUpdate: (state) => render(state),
    onConnectionError: (err) => {
      connEl.textContent = "connection error: " + err.message;
      connEl.style.color = "crimson";
    },
  });
  client.addEventListener("open", () => {
    connEl.textContent = "connected";
    connEl.style.color = "green";
  });
  client.addEventListener("error", (e) => {
    connEl.textContent = "socket error (see console)";
    connEl.style.color = "crimson";
    console.error("AgentClient socket error:", e);
  });
} catch (err) {
  connEl.textContent = "failed to create client: " + (err as Error).message;
  connEl.style.color = "crimson";
  console.error(err);
}

document.getElementById("submitFindings")!.addEventListener("click", async () => {
  if (!client) return;
  const cbomJson = findingsInputEl.value;
  try {
    await client.ready;
    const result = (await client.call("ingestCBOM", [cbomJson])) as {
      accepted: number;
      warnings: string[];
    };
    if (result.warnings.length > 0) {
      console.warn("CBOM parse warnings:", result.warnings);
    }
  } catch (err) {
    reportEl.textContent = "Request failed: " + (err as Error).message;
    console.error(err);
  }
});

document.getElementById("sendChat")!.addEventListener("click", async () => {
  if (!client) return;
  const input = document.getElementById("chatInput") as HTMLInputElement;
  const question = input.value.trim();
  if (!question) return;
  const log = document.getElementById("chatLog")!;

  const q = document.createElement("div");
  q.className = "msg-q";
  q.textContent = "Q: " + question;
  log.appendChild(q);
  input.value = "";

  try {
    await client.ready;
    const answer = await client.call("askQuestion", [question]);
    const a = document.createElement("div");
    a.className = "msg-a";
    a.textContent = String(answer);
    log.appendChild(a);
  } catch (err) {
    const a = document.createElement("div");
    a.className = "msg-a";
    a.style.color = "crimson";
    a.textContent = "Request failed: " + (err as Error).message;
    log.appendChild(a);
    console.error(err);
  }
  log.scrollTop = log.scrollHeight;
});
