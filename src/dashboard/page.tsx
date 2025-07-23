import { useEffect, useState } from "react"
import { invokeGetRowsConfig } from "@/api/db"
import ConnectionStatus from "@/dashboard/components/connection-status"
import InsertionPanel from "@/dashboard/components/insertion-panel"
import ListTables from "@/dashboard/components/list-tables"
import { openUrl } from "@tauri-apps/plugin-opener"

import { TooltipProvider } from "@/components/ui/tooltip"
import { DBCreds, UsageInfo } from "@/components/types"

export default function DashboardPage() {
  const [dbCreds, setDbCreds] = useState<DBCreds | null>(null)
  const [activeTable, setActiveTable] = useState<string | null>(null)
  const [usageInfo, setUsageInfo] = useState<UsageInfo[]>([])

  useEffect(() => {
    fetchUsageInfo()
  }, [dbCreds])

  async function fetchUsageInfo() {
    try {
      const info = await invokeGetRowsConfig()
      setUsageInfo(info)
      console.log("Usage Info:", info)
    } catch (error) {
      console.error("Error fetching usage info:", error)
      setUsageInfo([])
    }
  }

  return (
    <TooltipProvider>
      <div className="flex-col md:flex">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-between space-y-2 pr-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Welcome to DataForge!
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                If you like this project,{" "}
                <a
                  className="semi-bold cursor-pointer text-yellow-300 hover:underline"
                  onClick={(e) => {
                    e.preventDefault()
                    openUrl("https://github.com/MZaFaRM/dataforge")
                  }}
                >
                  a star on github
                </a>{" "}
                would mean a lot.
              </p>
            </div>
            <ConnectionStatus dbCreds={dbCreds} setDbCreds={setDbCreds} />
          </div>
          <div className="flex flex-row space-y-4">
            <ListTables
              usageInfo={usageInfo}
              dbCreds={dbCreds}
              setActiveTable={setActiveTable}
              activeTable={activeTable}
            />
            <InsertionPanel
              dbCreds={dbCreds}
              activeTable={activeTable}
              setActiveTable={setActiveTable}
              onInserted={() => fetchUsageInfo()}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
