import { useState } from "react"
import ConnectionStatus from "@/dashboard/components/connection-status"
import InsertionPanel from "@/dashboard/components/insertion-panel"
import ListTables from "@/dashboard/components/list-tables"
import { MainNav } from "@/dashboard/components/main-nav"
import { Overview } from "@/dashboard/components/overview"
import { RecentSales } from "@/dashboard/components/recent-sales"
import { Search } from "@/dashboard/components/search"
import TeamSwitcher from "@/dashboard/components/team-switcher"
import { UserNav } from "@/dashboard/components/user-nav"
import { openUrl } from "@tauri-apps/plugin-opener"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DbData } from "@/components/types"

export default function DashboardPage() {
  const [dbData, setDbData] = useState<DbData | null>(null)
  const [activeTable, setActiveTable] = useState<string | null>(null)

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
            <ConnectionStatus dbData={dbData} setDbData={setDbData} />
          </div>
          <div className="flex flex-row space-y-4">
            <ListTables
              dbData={dbData}
              setActiveTable={setActiveTable}
              activeTable={activeTable}
            />
            <InsertionPanel
              dbData={dbData}
              activeTable={activeTable}
              setActiveTable={setActiveTable}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
