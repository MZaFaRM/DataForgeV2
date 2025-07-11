import { DbData, TableData, TableEntry } from "@/components/types"

import { invokeAndExtract } from "./cli"

export function invokeDbInfo() {
  return invokeAndExtract<void, DbData>({ kind: "get_info" })
}

export function invokeDbConnection(dbCreds: DbData) {
  return invokeAndExtract<DbData, boolean>({ kind: "connect", body: dbCreds })
}

export function invokeDbDisconnect() {
  return invokeAndExtract<void, string>({ kind: "disconnect" })
}

export function invokeGetTables() {
  return invokeAndExtract<void, TableEntry[]>({ kind: "get_tables" })
}

export function invokeTableData(table: string) {
  return invokeAndExtract<string, TableData>({
    kind: "get_table_metadata",
    body: table,
  })
}
