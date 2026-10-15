let organization = "";
let csrfBootstrap: Promise<{ csrfToken: string }> | undefined;
export function setOrganization(id: string) {
  organization = id;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: unknown,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (organization) headers.set("X-Organization-ID", organization);
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.method && !["GET", "HEAD"].includes(options.method)) {
    let token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrftoken="))
      ?.split("=")[1];
    if (!token) {
      csrfBootstrap ??= api<{ csrfToken: string }>("auth/csrf/");
      try {
        token = (await csrfBootstrap).csrfToken;
      } finally {
        csrfBootstrap = undefined;
      }
    }
    headers.set("X-CSRFToken", decodeURIComponent(token));
  }
  const response = await fetch("/api/v1/" + path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const fields = body.error?.fields;
    const detail =
      fields && !fields.detail
        ? Object.entries(fields)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(" | ")
        : "";
    throw new ApiError(
      [body.error?.message || "The request could not be completed.", detail]
        .filter(Boolean)
        .join(" "),
      response.status,
      fields,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const send = <T>(
  path: string,
  data: unknown,
  method = "POST",
  key?: string,
) =>
  api<T>(path, {
    method,
    body: JSON.stringify(data),
    headers: key ? { "Idempotency-Key": key } : {},
  });
export async function all<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const result = await api<import("../types").Page<T>>(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}`,
    );
    rows.push(...result.results);
    if (!result.next) return rows;
    page++;
  }
}
export async function downloadStock(warehouse = "") {
  const response = await fetch(
    `/api/v1/reports/stock-on-hand/export.csv?warehouse=${warehouse}`,
    {
      headers: { "X-Organization-ID": organization },
      credentials: "same-origin",
    },
  );
  if (!response.ok) throw new Error("Export failed. Please retry.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "stock-on-hand.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
