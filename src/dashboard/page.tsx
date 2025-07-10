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
import { DbInfo } from "@/components/types"

export default function DashboardPage() {
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null)
  const [activeTable, setActiveTable] = useState<string | null>(null)

  return (
    <>
      <div className="flex-col md:flex">
        <div className="border-b">
          <div className="flex h-16 items-center px-4">
            <TeamSwitcher />
            <MainNav className="mx-6" />
            <div className="ml-auto flex items-center space-x-4">
              <Search />
              <UserNav />
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-between space-y-2">
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
            <ConnectionStatus dbInfo={dbInfo} setDbInfo={setDbInfo} />
          </div>
          <div className="flex flex-row space-y-4">
            <ListTables
              dbInfo={dbInfo}
              setActiveTable={setActiveTable}
              activeTable={activeTable}
            />
            <InsertionPanel dbInfo={dbInfo} activeTable={activeTable} />
          </div>
        </div>
      </div>
    </>
  )
}
