import { act, useEffect, useRef, useState } from "react"
import { invokeRunSql, invokeTableData } from "@/api/db"
import {
  invokeGetFakerMethods,
  invokeLoadSpec,
  invokeVerifySpec,
} from "@/api/fill"
import InsertTabRows from "@/dashboard/components/ui/insert-tab"
import RenderLogs from "@/dashboard/components/ui/log-tab"
import RenderPreview from "@/dashboard/components/ui/preview-tab"
import { sql } from "@codemirror/lang-sql"
import { Icon } from "@iconify/react"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import CodeMirror, { EditorView } from "@uiw/react-codemirror"
import { ta } from "date-fns/locale"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody } from "@/components/ui/table"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/use-toast"
import {
  ColumnSpec,
  ColumnSpecMap,
  DataPackage,
  DBCreds,
  TableMetadata,
  TablePacket,
  TableSpec,
  TableSpecEntry,
  TableSpecMap,
} from "@/components/types"

export default function SqlInsertionTab({
  onSuccess,
}: {
  onSuccess: () => void
}) {
  const [sqlScript, setSqlScript] = useState<string>("")
  const { theme } = useTheme()

  function runSql() {
    if (!sqlScript || sqlScript.trim() === "") {
      toast({
        variant: "destructive",
        title: "Empty SQL script",
        description: "Please enter a valid SQL script to execute.",
      })
      return
    }

    invokeRunSql(sqlScript)
      .then((success) => {
        if (success) {
          toast({
            variant: "success",
            title: "SQL executed successfully",
          })
          onSuccess()
        } else {
          toast({
            variant: "destructive",
            title: "SQL execution failed",
            description: "Please check your SQL script for errors.",
          })
        }
      })
      .catch((error) => {
        console.error("Error executing SQL:", error)
        toast({
          variant: "destructive",
          title: "SQL execution error",
          description: error.message,
        })
      })
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <CodeMirror
          value={sqlScript || "\n".repeat(100)}
          onChange={(value) => setSqlScript(value)}
          placeholder={"-- SQL expression"}
          extensions={[sql(), EditorView.lineWrapping]}
          theme={theme === "light" ? githubLight : githubDark}
          className="h-full w-full"
          style={{ border: "none" }}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
          }}
        />
      </div>
      <div className="absolute bottom-4 right-4 z-10 bg-inherit p-2 text-right">
        <button
          className={cn(
            "flex items-center rounded border px-4 py-2 text-sm font-medium",
            "text-green-500 hover:bg-green-600 hover:text-white"
          )}
          onClick={() => runSql()}
        >
          <Icon icon="lsicon:lightning-filled" className="mr-2" />
          Execute All
        </button>
      </div>
    </>
  )
}
