export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function markdown(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/markdown" },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}
