/**
 * Lisān OCR — corrections collector (Cloudflare Worker).
 *
 * Receives an opt-in correction from the OCR page and commits it to a GitHub
 * repo in the exact format the training pipeline consumes:
 *
 *     corrections/<YYYY>/<MM>/<id>.png      the image the user OCR'd
 *     corrections/<YYYY>/<MM>/<id>.gt.txt   the corrected text  (training label)
 *     corrections/<YYYY>/<MM>/<id>.json     metadata (raw OCR, model, consent…)
 *
 * The GitHub token lives only in a Worker secret (GH_TOKEN) — never in the
 * public page. All three files land in one atomic commit via the Git Data API.
 *
 * Config: see wrangler.toml (vars) and README.md (secret + repo setup).
 */

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "https://abdealikhurrum.github.io";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "invalid JSON" }, 400, cors); }

    // --- validation -------------------------------------------------------
    if (body.consent !== true)
      return json({ error: "consent required" }, 400, cors);

    const corrected = (body.correctedText || "").trim();
    if (!corrected) return json({ error: "correctedText required" }, 400, cors);

    // image may arrive as a data URL or bare base64
    let mime = "image/png", b64 = String(body.image || "");
    const m = /^data:([^;]+);base64,(.*)$/s.exec(b64);
    if (m) { mime = m[1]; b64 = m[2]; }
    if (!/^image\/(png|jpe?g|webp)$/.test(mime))
      return json({ error: "unsupported image type" }, 400, cors);
    if (!b64) return json({ error: "image required" }, 400, cors);

    const maxBytes = (parseInt(env.MAX_IMAGE_KB, 10) || 4096) * 1024;
    if (b64.length * 0.75 > maxBytes)
      return json({ error: "image too large" }, 413, cors);

    // --- optional KV rate limit (bind a KV namespace as RATELIMIT) ---------
    if (env.RATELIMIT) {
      const ip = request.headers.get("cf-connecting-ip") || "anon";
      const key = "rl:" + ip;
      const used = parseInt((await env.RATELIMIT.get(key)) || "0", 10);
      const limit = parseInt(env.RATE_PER_HOUR, 10) || 20;
      if (used >= limit) return json({ error: "rate limit exceeded" }, 429, cors);
      await env.RATELIMIT.put(key, String(used + 1), { expirationTtl: 3600 });
    }

    // --- build the three files --------------------------------------------
    const now = new Date();
    const id = now.toISOString().replace(/[:.]/g, "-") + "-" +
               Math.random().toString(36).slice(2, 8);
    const ext = /jpe?g/.test(mime) ? "jpg" : (mime === "image/webp" ? "webp" : "png");
    const dir = `corrections/${now.getUTCFullYear()}/` +
                `${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const meta = {
      id,
      created: now.toISOString(),
      model: body.model || null,
      rawText: body.rawText || "",
      correctedText: corrected,
      note: body.note || "",
      sourceFilename: body.sourceFilename || null,
      userAgent: request.headers.get("user-agent") || "",
      consent: true,
    };

    const files = [
      { path: `${dir}/${id}.${ext}`, b64 },
      { path: `${dir}/${id}.gt.txt`, text: corrected },
      { path: `${dir}/${id}.json`, text: JSON.stringify(meta, null, 2) },
    ];

    try {
      await commit(env, files, `correction ${id}`);
    } catch (e) {
      return json({ error: "storage failed", detail: String(e) }, 502, cors);
    }
    return json({ ok: true, id }, 200, cors);
  },
};

// One atomic commit of several files via the GitHub Git Data API.
async function commit(env, files, message) {
  const owner = env.GH_OWNER, repo = env.GH_REPO, branch = env.GH_BRANCH || "main";
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN secret not set");

  const api = (path, opts = {}) =>
    fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "lsd-ocr-corrections-worker",
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });

  const ref = await must(api(`/repos/${owner}/${repo}/git/ref/heads/${branch}`), "get ref");
  const baseSha = ref.object.sha;
  const baseCommit = await must(api(`/repos/${owner}/${repo}/git/commits/${baseSha}`), "get commit");
  const baseTree = baseCommit.tree.sha;

  const tree = [];
  for (const f of files) {
    const payload = f.b64 !== undefined
      ? { content: f.b64, encoding: "base64" }
      : { content: f.text, encoding: "utf-8" };
    const blob = await must(
      api(`/repos/${owner}/${repo}/git/blobs`, { method: "POST", body: JSON.stringify(payload) }),
      "create blob");
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await must(
    api(`/repos/${owner}/${repo}/git/trees`,
        { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree }) }),
    "create tree");
  const newCommit = await must(
    api(`/repos/${owner}/${repo}/git/commits`,
        { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }) }),
    "create commit");
  await must(
    api(`/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) }),
    "update ref");
}

async function must(promise, label) {
  const res = await promise;
  if (!res.ok) throw new Error(`${label}: ${res.status} ${await res.text()}`);
  return res.json();
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
