type Response<T> = Record<string, unknown> & {
  status: "ok" | "error"
  payload?: T
  error?: string
}

type Request<T> = Record<string, unknown> & {
  kind: string
  body: T
}

interface DbInfo {
  host: string
  user: string
  port: string
  name: string
  connected?: boolean
  password?: string
  error?: string
}

export type { Response, Request, DbInfo }
