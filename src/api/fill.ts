import { TablePacket, TableSpec } from "@/components/types"

import { invokeAndExtract } from "./cli"

export function invokeGetFakerMethods() {
  return invokeAndExtract<void, string[]>({ kind: "get_faker_gen" })
}

export function invokeVerifySpec(tableSpec: TableSpec) {
  return invokeAndExtract<TableSpec, TablePacket>({
    kind: "verify_spec",
    body: tableSpec,
  })
}

export function invokeLoadSpec(dbId: number, tableName: string) {
  return invokeAndExtract<Record<string, string | number>, TableSpec>({
    kind: "load_spec",
    body: {
      dbId: dbId,
      tableName: tableName,
    },
  })
}

export function invokeInsertSqlPacket(packet: TablePacket) {
  return invokeAndExtract<TablePacket, { pendingWrites: number }>({
    kind: "insert_sql_packet",
    body: packet,
  })
}

export function invokeExportSqlPacket(packet: TablePacket, path: string) {
  return invokeAndExtract<{ path: string } & TablePacket, string>({
    kind: "export_sql_packet",
    body: { ...packet, path: path },
  })
}
