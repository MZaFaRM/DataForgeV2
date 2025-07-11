import { invokeAndExtract } from "./cli";

export function invokeGetFakerMethods() {
  return invokeAndExtract<void, string[]>({ kind: "faker_methods" })
}
