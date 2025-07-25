import { TablePacket, TableSpec } from "@/components/types"

import { invokeCliRequest } from "./cli"

export function invokeGetFakerMethods() {
  return invokeCliRequest<void, string[]>({ kind: "get_gen_methods" })
}

export function invokeGenPackets(tableSpec: TableSpec) {
  return invokeCliRequest<TableSpec, TablePacket>({
    kind: "get_gen_packets",
    body: tableSpec,
  })
}

export function invokeGetGenPacket(packetId: string, page: number) {
  return invokeCliRequest<{ packetId: string; page: number }, TablePacket>({
    kind: "get_gen_packet",
    body: { packetId: packetId, page: page },
  })
}

export function invokeLoadSpec(dbId: number, tableName: string) {
  return invokeCliRequest<Record<string, string | number>, TableSpec>({
    kind: "get_pref_spec",
    body: {
      dbId: dbId,
      tableName: tableName,
    },
  })
}

export function invokeInsertSqlPacket(packetId: string) {
  return invokeCliRequest<{ packetId: string }, { pendingWrites: number }>({
    kind: "set_db_insert",
    body: { packetId: packetId },
  })
}

export function invokeExportSqlPacket(packetId: string, path: string) {
  return invokeCliRequest<{ path: string; packetId: string }, string>({
    kind: "set_db_export",
    body: { packetId: packetId, path: path },
  })
}
