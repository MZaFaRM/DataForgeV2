import { TablePacket, TableSpec } from "@/components/types"

import { invokeAndExtract } from "./cli"

export function invokeGetFakerMethods() {
  return invokeAndExtract<void, string[]>({ kind: "faker_methods" })
}

export function invokeVerifySpec(tableSpec: TableSpec) {
  console.log("Verify", tableSpec);
  return invokeAndExtract<TableSpec, TablePacket>({
    kind: "verify_spec",
    body: tableSpec,
  })
}
