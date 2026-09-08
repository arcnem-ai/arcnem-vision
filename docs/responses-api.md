# OpenAI Responses

OpenAI graph workers and supervisors use `go-openai`'s native Responses API.
Dashboard collection chat and workflow draft generation use LangChain's Responses
support. Embeddings and Replicate tools keep their existing endpoints.

Worker and supervisor node JSON configuration accepts:

```json
{
  "reasoning_effort": "low",
  "max_output_tokens": 4096
}
```

Omitted values use the model's defaults. The output budget includes reasoning
and visible output. Choose an effort supported by the selected model; invalid
values fail rather than silently downgrading reasoning. Existing worker
`output_schema` validation and repair retries still apply.

The OCR Review Supervisor seed uses GPT-5.6 Luna with low reasoning. Seeds are
for disposable databases; deployment does not rewrite existing workflows.

API model selection uses `OPENAI_MODEL`. Sampling temperature is omitted so the
same call sites support reasoning models. Provider output storage is disabled;
encrypted reasoning is retained in memory for each sequential Go agent invocation
and passed back with tool results and repair turns. It is not shared between runs.
The TypeScript integration likewise requests encrypted reasoning with storage off.

The Go graph calls are synchronous. The dashboard continues to emit its existing
SSE events after agent completion. Refused, incomplete, and failed Responses are
errors rather than successful partial results.

Run deterministic checks from `models/agents` with `go test ./...` and from
`server` with `bun test`. For an explicit live provider check (uses API credits):

```sh
cd models/agents
OPENAI_API_KEY=... go test -tags provider_live ./graphs -run TestLiveResponses -v
```

That check exercises Luna low reasoning plus a real function call and image
extraction through the worker's structured-output validation.
