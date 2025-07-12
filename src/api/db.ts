import { DbData, TableData, TableEntry } from "@/components/types"

import { invokeAndExtract } from "./cli"

export function invokeDbInfo() {
  return invokeAndExtract<void, DbData>({ kind: "info" })
}

export function invokeDbConnection(dbCreds: DbData) {
  return invokeAndExtract<DbData, boolean>({ kind: "connect", body: dbCreds })
}

export function invokeDbDisconnect() {
  return invokeAndExtract<void, string>({ kind: "disconnect" })
}

export function invokeGetTables() {
  return invokeAndExtract<void, TableEntry[]>({ kind: "tables" })
}

export function invokeTableData(table: string) {
  return invokeAndExtract<{ name: string }, TableData>({
    kind: "table_metadata",
    body: { name: table },
  })
}
