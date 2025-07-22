import { DBCreds, TableEntry, TableMetadata } from "@/components/types"

import { invokeAndExtract } from "./cli"

export function invokeDbInfo() {
  return invokeAndExtract<void, DBCreds>({ kind: "get_info_db" })
}

export function invokeDbConnection(dbCreds: DBCreds) {
  return invokeAndExtract<DBCreds, DBCreds>({ kind: "connect", body: dbCreds })
}

export function invokeDbDisconnect() {
  return invokeAndExtract<void, string>({ kind: "disconnect" })
}

export function invokeListDbCreds() {
  return invokeAndExtract<void, DBCreds[]>({ kind: "list_connections" })
}

export function invokeDbDeletion(dbCreds: DBCreds) {
  return invokeAndExtract<DBCreds, string>({
    kind: "delete_connection",
    body: dbCreds,
  })
}

export function invokeDbReconnection(dbCreds: DBCreds) {
  return invokeAndExtract<DBCreds, DBCreds>({
    kind: "reconnect",
    body: dbCreds,
  })
}

export function invokeGetTables() {
  return invokeAndExtract<void, TableEntry[]>({ kind: "tables" })
}

export function invokeTableData(table: string) {
  return invokeAndExtract<{ name: string }, TableMetadata>({
    kind: "table_metadata",
    body: { name: table },
  })
}

export function invokeGetLogs(lines: number = 200) {
  return invokeAndExtract<{ lines: number }, string[]>({
    kind: "get_logs",
    body: { lines },
  })
}

export function invokeClearLogs() {
  return invokeAndExtract<void, []>({ kind: "clear_logs" })
}

export function invokeRunSql(sql: string) {
  return invokeAndExtract<{ sql: string }, boolean>({
    kind: "run_sql",
    body: { sql },
  })
}

export function invokeDbCommit() {
  return invokeAndExtract<void, string>({ kind: "set_commit_db" })
}

export function invokeDbRollback() {
  return invokeAndExtract<void, string>({ kind: "set_rollback_db" })
}

export function invokeDbGetUncommitted() {
  return invokeAndExtract<void, number>({ kind: "get_uncommitted_db" })
}
