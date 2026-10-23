const TOKEN_KEY = "queuesmart-token";

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.message || data.errors?.[0]?.message || "Something went wrong.";
    const error = new Error(message);
    error.status = response.status;
    error.errors = data.errors;
    throw error;
  }
  return data;
}
