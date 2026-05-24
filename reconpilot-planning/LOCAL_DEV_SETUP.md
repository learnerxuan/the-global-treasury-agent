# Local Dev Setup

## NVIDIA Extraction Provider

For the current hackathon branch, use NVIDIA until the Chutes sponsor account is available.

Create `.env.local` in the project root:

```env
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=replace_with_your_key
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
```

Then restart the dev server:

```powershell
npm run dev
```

Environment variables are loaded only when the server starts. If the server was already running, stop it with `Ctrl+C` and start it again.

## Chutes Provider Later

When the sponsor account is available, switch `.env.local` to:

```env
LLM_PROVIDER=chutes
CHUTES_API_KEY=replace_with_chutes_key
CHUTES_MODEL=default:latency
```

Do not commit `.env.local`.
