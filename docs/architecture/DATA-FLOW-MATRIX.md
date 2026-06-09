# Allowed and Forbidden Data Flows

## Purpose
To strictly define the boundaries of data movement between the browser, the bridge, the agent, and the custody layer to prevent unauthorized exfiltration or automatic execution.

## 1. Data Flow Matrix

| From | To | Data Type | Status | Condition / Constraint |
|---|---|---|---|---|
| **Browser** | **Bridge** | Prompt, Context, URL, Title | ✅ Allowed | Via approved extension POST to `/incoming` |
| **Browser** | **Librarian** | Any | ❌ Forbidden | No direct access to custody layer |
| **Bridge** | **Agent** | Approved Work Packet | ✅ Allowed | Only after human approval (`approved` state) |
| **Bridge** | **Browser** | Queue Status, Results | ✅ Allowed | Read-only display for human review |
| **Agent** | **Bridge** | Result, State Updates | ✅ Allowed | Via `queue_complete` or `queue_start` |
| **Agent** | **Browser** | UI Control, Form Input | ❌ Forbidden | No automatic browser driving |
| **Bridge** | **Browser** | Auto-Postback / Replies | ❌ Forbidden | No automatic injection into web AI tools |
| **Librarian** | **Bridge** | Policy Decisions | ✅ Allowed | To inform the agent of constraints |
| **Librarian** | **Bridge** | Custody Artifact Status | ✅ Allowed | Read-only MCP queries for status reflection; no Librarian mutation (AB-6) |

## 2. Forbidden Flow Details
- **No Auto-Injection:** The bridge must never automatically send a result back into a ChatGPT/Claude text area. The human must manually copy/paste or trigger the action.
- **No Silent Scraping:** The extension may capture selected text or the current page, but it must not silently scrape the entire browser history or unrelated tabs.
- **No Direct Execution:** A request from the browser cannot trigger a local script without passing through the `incoming` $\rightarrow$ `approved` $\rightarrow$ `in-progress` pipeline.

## 3. Data Minimization
Only the minimum required context (Prompt, URL, Title) is captured. Sensitive local environment variables or private keys must never be sent back to the browser surface.
