import { invoke } from "@tauri-apps/api/core"
import camelcaseKeys from "camelcase-keys"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { CliRequest, CliResponse, DBCreds } from "@/components/types"

export async function invokeCliRequest(req: CliRequest<any>): Promise<string> {
  return invoke<string>("send", {
    payload: JSON.stringify(req),
  })
}

export async function invokeAndExtract<T = unknown, R = unknown>(
  request: CliRequest<T>
): Promise<R> {
  try {
    const raw = await invoke<string>("send", {
      payload: JSON.stringify(request),
    })

    const res = JSON.parse(raw || "{}") as CliResponse<R>

    if (res.status === "ok" && res.payload) {
      return camelcaseKeys(res.payload, { deep: true }) as R
    } else {
      throw new Error(res.error || "Unknown error")
    }
  } catch (err: any) {
    throw new Error(err?.message || err)
  }
}
