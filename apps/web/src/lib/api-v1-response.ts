const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export function apiJson(body: object, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return Response.json(body, { ...init, headers });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return apiJson({ error: { code, message } }, { status, headers });
}

export function apiUnauthorized(): Response {
  return apiError(
    "unauthorized",
    "Provide a valid Currentfold API bearer token.",
    401,
    { "www-authenticate": 'Bearer realm="Currentfold API"' },
  );
}
