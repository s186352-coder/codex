# Custom "三屆嘴砲冠軍" GPT Playbook

This guide packages the persona, API wiring, and knowledge-base upload flows for a debate-focused private GPT. Copy/paste the blocks below into your GPT configuration to get a secure, consistent setup.

## 1) Persona and reply structure (copy/paste)

```
角色定位：你是「三屆嘴砲冠軍」，專精於邏輯反擊、道德制壓、事實拆解、心理反轉、法律說理；目標是讓使用者在任何爭論中都能擊破對方立場。

行為要求：
1. 先分析對方話語中的漏洞、邏輯錯誤、情緒操作、隱形前提。
2. 每次提供三種回覆：
   A. 法律責任與條文框架版
   B. 道德＋責任導向的壓制版
   C. 以邏輯拆解構建強力反擊的擊潰版
3. 語氣：冷靜、強度、壓迫感、結構性；避免粗俗罵人，可用犀利反問與框架反轉。
4. 永遠站在使用者這邊，優先建構「最有力的立場」。

進階功能：
- 若有對話紀錄/截圖/影像，先做「戰場分析」再給策略。
- 可模擬對方反駁並提前給破解策略。
- 主動拆解情緒勒索、偷換概念、推責任等手法。
```

## 2) API base URL and endpoints

Use a single versioned base: `https://api.example.com/v1`. Recommended endpoints:

- `POST /argument/strategy` — main orchestration call.
- `POST /argument/simulate` — optional “opponent move” simulator.
- `POST /knowledge/upload` — knowledge-base ingestion (files or URLs).
- `GET  /health` — liveness check.

Example JSON schema (works for OpenAPI or JSON schema blocks in Actions):

```json
{
  "openapi": "3.1.0",
  "info": { "title": "Debate GPT Actions", "version": "1.0.0" },
  "servers": [ { "url": "https://api.example.com/v1" } ],
  "paths": {
    "/argument/strategy": {
      "post": {
        "summary": "Build three rebuttal styles",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "opponent_statements": { "type": "array", "items": { "type": "string" } },
                  "context": { "type": "string", "description": "Conversation background" },
                  "user_goal": { "type": "string", "description": "Desired outcome" },
                  "risk_tolerance": { "type": "string", "enum": ["low", "medium", "high"], "default": "medium" }
                },
                "required": ["opponent_statements", "user_goal"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Three ready-to-send replies",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "legal": { "type": "string" },
                    "moral": { "type": "string" },
                    "logic": { "type": "string" },
                    "analysis": { "type": "string", "description": "Battlefield analysis" }
                  },
                  "required": ["legal", "moral", "logic"]
                }
              }
            }
          }
        }
      }
    },
    "/argument/simulate": {
      "post": {
        "summary": "Simulate opponent rebuttals and counter-strategy",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "current_reply": { "type": "string" },
                  "opponent_profile": { "type": "string", "description": "Tone/knowledge level" }
                },
                "required": ["current_reply"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Predicted rebuttals and counters",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "predicted_rebuttal": { "type": "string" },
                    "counter": { "type": "string" }
                  },
                  "required": ["predicted_rebuttal", "counter"]
                }
              }
            }
          }
        }
      }
    },
    "/knowledge/upload": {
      "post": {
        "summary": "Upload files or URLs for retrieval",
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "file": { "type": "string", "format": "binary" },
                  "url": { "type": "string", "description": "Optional: remote resource to pull" },
                  "tags": { "type": "array", "items": { "type": "string" } }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Ingestion result"
          }
        }
      }
    },
    "/health": { "get": { "summary": "Service health", "responses": { "200": { "description": "OK" } } } }
  }
}
```

## 3) API key authentication

- **Mode:** `Bearer` header is the simplest for Actions.
- **Header:** `Authorization: Bearer <API_KEY>`.
- **Key rotation:** accept multiple active keys (e.g., check against a list in storage) and log usage per key.
- **Example verification logic (pseudocode):**

```
const incoming = req.headers["authorization"] ?? "";
if (!incoming.startsWith("Bearer ")) reject(401);
const token = incoming.slice(7);
if (!isValidKey(token)) reject(401);
```

- For server-to-server safety, pin allowed origins/IPs and enforce HTTPS only.

## 4) Knowledge-base uploads

- **Accepted formats:** `.pdf`, `.docx`, `.txt`, `.md`, `.json`; limit size (e.g., 20 MB) and page count to keep embedding costs predictable.
- **Curl example (file):**

```bash
curl -X POST https://api.example.com/v1/knowledge/upload \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@/path/to/evidence.pdf" \
  -F "tags=debate" -F "tags=case"
```

- **Curl example (URL ingestion):**

```bash
curl -X POST https://api.example.com/v1/knowledge/upload \
  -H "Authorization: Bearer $API_KEY" \
  -F "url=https://example.com/thread.html" \
  -F "tags=forum" -F "tags=opponent"
```

- **Retrieval tip:** store the returned document IDs and pass them in the `context` field of `/argument/strategy` so replies cite the uploaded material.

## 5) Action schema presets for the UI (three screens)

Use these snippets to mirror the three configuration screens shown in the reference images:

1. **Base settings (創作／設定位 tab):**
   - Knowledge uploads: toggle **on**; prepare to attach PDFs/screenshots.
   - Capabilities: enable `網頁瀏覽器` and `程式碼指令/資料科學分析` if your actions call out to the API or need light parsing.
   - Persona: paste the block from Section 1 into the system instructions area.

2. **Action structure selector (新增動作 → 結構描述):**
   - Choose **OpenAPI** and paste the JSON schema from Section 2.
   - If you need a minimal stub, switch to **空白範本** and start with just `/health` before adding other paths.

3. **API key modal (驗證):**
   - Select **API 金鑰** → **Bearer**.
   - Paste your key (or a placeholder like `sk-live-...`); keep rotation notes handy.
   - Save, then hit **測試** in the Actions UI to confirm a `200` from `/health`.

## 6) Operational safeguards

- Log every action call with: timestamp, key ID, path, response status, and hashed user ID.
- Rate limit per key (e.g., 60 req/min) and per IP to prevent abuse.
- Return structured errors: `{ "error": { "code": "RATE_LIMIT", "message": "..." } }` to help the GPT explain failures gracefully.
- For battle strategies, cap reply length in your API (e.g., 800 tokens) to avoid runaway outputs.

## 7) Quick test matrix

- `POST /health` → expect `200 OK`.
- `POST /argument/strategy` with two statements and `user_goal` set → expect all three reply tracks and analysis.
- `POST /argument/simulate` with `current_reply` → expect `predicted_rebuttal` and `counter`.
- `POST /knowledge/upload` with a small PDF → expect document ID and tags echoed.

These defaults give you a reproducible, key-protected debate assistant with uploadable evidence and structured actions ready for GPT integration.
