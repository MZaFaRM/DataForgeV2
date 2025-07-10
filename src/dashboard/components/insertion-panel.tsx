import { json } from "stream/consumers"
import { useEffect, useRef, useState } from "react"
import ConnectionStatus from "@/dashboard/components/connection-status"
import { MainNav } from "@/dashboard/components/main-nav"
import { Overview } from "@/dashboard/components/overview"
import { RecentSales } from "@/dashboard/components/recent-sales"
import { Search } from "@/dashboard/components/search"
import TeamSwitcher from "@/dashboard/components/team-switcher"
import { UserNav } from "@/dashboard/components/user-nav"
import { Icon } from "@iconify/react"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { ta } from "date-fns/locale"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DbInfo, Request, Response } from "@/components/types"

interface ListTablesProps {
  dbInfo: DbInfo | null
  activeTable: string | null
}

export default function InsertionPanel({
  dbInfo,
  activeTable,
}: ListTablesProps) {
  return (
    <div>
      {activeTable ? (
        <h2 className="mb-4 text-2xl font-semibold tracking-wide">
          {activeTable}
        </h2>
      ) : (
        <div className="mb-4 flex items-center space-x-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Icon
              key={i}
              icon="meteocons:dust-wind"
              className="mb-4 h-8 w-8 text-muted-foreground"
            />
          ))}
        </div>
      )}
    </div>
  )
}
