# Lisān OCR — corrections collector

A tiny Cloudflare Worker that receives opt-in corrections from the OCR page and
commits them to a GitHub repo in the training pipeline's format
(`<id>.png` + `<id>.gt.txt` + `<id>.json`). The GitHub token stays server-side
in a Worker secret — never in the public page.

## Deploy

1. **Create the corrections repo** (can be private), e.g. `lsd-ocr-corrections`,
   with at least one commit on `main` (a README is enough — the Worker commits
   onto an existing branch).

2. **Make a token.** A fine-grained Personal Access Token scoped to *only* that
   repo, with **Contents: Read and write**. (Or a GitHub App installation token.)

3. **Install wrangler & log in:**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

4. **Set config & secret.** Edit `wrangler.toml` (`GH_OWNER`, `GH_REPO`,
   `ALLOWED_ORIGIN`), then:
   ```bash
   wrangler secret put GH_TOKEN      # paste the PAT
   ```

5. *(optional)* **Rate limiting:**
   ```bash
   wrangler kv namespace create RATELIMIT
   ```
   then uncomment the `[[kv_namespaces]]` block in `wrangler.toml` with the
   printed id.

6. **Deploy:**
   ```bash
   wrangler deploy
   ```
   Copy the resulting URL (e.g. `https://lsd-ocr-corrections.<acct>.workers.dev`).

7. **Wire up the page.** In `ocr.html`, set `CORRECTIONS_ENDPOINT` to that URL.
   Until it's set, the page's "Contribute" button falls back to downloading the
   contribution as a JSON file instead of uploading.

## Request shape

`POST` JSON:
```json
{
  "image": "data:image/png;base64,…",
  "rawText": "model output before edits",
  "correctedText": "the human-corrected text",
  "model": "ara",
  "sourceFilename": "page12.jpg",
  "note": "optional",
  "consent": true
}
```
`consent: true` and a non-empty `correctedText` are required; oversized or
non-image payloads are rejected.

## Folding corrections into training

Each correction is already a ground-truth pair. Pull the repo and point the
generator/trainer at it — the `.png` + `.gt.txt` layout is exactly what
tesstrain consumes (same as `ocr/` synthetic output and PDF real pairs).
