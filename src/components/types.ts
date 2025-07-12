type CliResponse<T> = Record<string, unknown> & {
  status: "ok" | "error"
  payload?: T
  error?: string
}

type CliRequest<T> = Record<string, unknown> & {
  kind: string
  body?: T
}

interface DbData {
  host: string
  user: string
  port: string
  name: string
  connected?: boolean
  password?: string
  error?: string
}

interface ColumnData {
  name: string
  type: string
  primaryKey: boolean
  nullable: boolean
  default: string | null
  autoincrement: boolean
  computed: boolean
  foreignKeys: { table: string; column: string }
  length: number | null
}

interface TableData {
  uniques: string[][]
  parents: string[]
  columns: ColumnData[]
}

interface TableEntry {
  name: string
  parents: number
  rows: number
}

interface DataEntry {}

interface DataPackage {
  verified: boolean
  table: string
  entries: DataEntry[]
  inserted: boolean
}

export type {
  CliResponse,
  CliRequest,
  DbData,
  TableData,
  TableEntry,
  ColumnData,
  DataEntry,
  DataPackage,
}
