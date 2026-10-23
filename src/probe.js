export function modelsEndpoint(profile) {
  const url = new URL(profile.baseUrl);
  const path = url.pathname.replace(/\/+$/, "");
  if (profile.target === "codex") {
    url.pathname = `${path}/models`;
  } else {
    url.pathname = path.endsWith("/v1") ? `${path}/models` : `${path}/v1/models`;
  }
  return url;
}

function authHeaders(profile) {
  return profile.target === "codex"
    ? { Authorization: `Bearer ${profile.apiKey}` }
    : { "x-api-key": profile.apiKey, "anthropic-version": "2023-06-01" };
}

function redact(value, secret) {
  const text = String(value || "");
  return secret ? text.split(secret).join("[redacted]") : text;
}

function normalizeModels(payload) {
  const source = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  const unique = new Map();

  source.forEach((item, index) => {
    const id = typeof item === "string" ? item : item?.id || item?.name;
    if (!id || unique.has(id)) return;
    const rawCreated = typeof item === "object" ? item.created ?? item.created_at : undefined;
    const created = typeof rawCreated === "number" ? rawCreated * 1000 : Date.parse(rawCreated || "");
    unique.set(id, {
      id,
      displayName: typeof item === "object" ? item.display_name || item.displayName : undefined,
      created: Number.isFinite(created) ? created : undefined,
      index,
    });
  });

  return [...unique.values()].sort((a, b) => {
    if (a.created !== undefined && b.created !== undefined && a.created !== b.created) {
      return b.created - a.created;
    }
    return a.index - b.index;
  });
}

export async function fetchModels(profile, timeoutMs = 10000) {
  const url = modelsEndpoint(profile);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: authHeaders(profile),
      signal: controller.signal,
    });
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw Object.assign(new Error(`Model endpoint returned non-JSON: ${body.slice(0, 160).replace(/\s+/g, " ").trim()}`), {
        status: response.status,
        url: url.toString(),
      });
    }
    if (!response.ok) {
      const message = payload.error?.message || payload.message || `HTTP ${response.status}`;
      throw Object.assign(new Error(redact(message, profile.apiKey)), {
        status: response.status,
        url: url.toString(),
      });
    }
    const models = normalizeModels(payload);
    if (models.length === 0) {
      throw Object.assign(new Error("Model endpoint returned no model IDs"), {
        status: response.status,
        url: url.toString(),
      });
    }
    return { models, status: response.status, url: url.toString() };
  } catch (error) {
    if (error.name === "AbortError") {
      throw Object.assign(new Error(`Timed out after ${timeoutMs}ms`), {
        status: 0,
        url: url.toString(),
      });
    }
    error.message = redact(error.message, profile.apiKey);
    error.status ??= 0;
    error.url ??= url.toString();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function requestEndpoint(profile) {
  const base = profile.baseUrl.replace(/\/+$/, "");
  if (profile.target === "codex") return `${base}/responses`;
  return `${base}${base.endsWith("/v1") ? "" : "/v1"}/messages`;
}

export async function probeProfile(profile, timeoutMs = 10000) {
  try {
    const result = await fetchModels(profile, timeoutMs);
    return {
      ok: true,
      status: result.status,
      url: result.url,
      detail: `${result.models.length} models returned`,
    };
  } catch (error) {
    return {
      ok: false,
      status: error.status || 0,
      url: error.url || modelsEndpoint(profile).toString(),
      detail: redact(error.message, profile.apiKey),
    };
  }
}
