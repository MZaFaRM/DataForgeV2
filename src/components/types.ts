type Response<T> = Record<string, unknown> & {
  status: "ok" | "error"
  payload?: T
  error?: string
}

type Request<T> = Record<string, unknown> & {
  kind: string
  body: T
}

export type { Response, Request }
