import { startTransition, useEffect, useState } from "react"
import { invokeClearLogs, invokeGetLogs } from "@/api/db"
import { Icon } from "@iconify/react"

import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/use-toast"

export default function RenderLogs({ activeTab }: { activeTab?: string }) {
  const [logs, setLogs] = useState<string[]>([])
  const [showCheck, setShowCheck] = useState<boolean>(false)

  useEffect(() => {
    if (activeTab === "log") {
      retrieveLogs()
      const intervalID = setInterval(() => {
        retrieveLogs()
      }, 1000)

      return () => clearInterval(intervalID)
    }
  }, [activeTab])

  function retrieveLogs() {
    invokeGetLogs()
      .then((logs) => {
        startTransition(() => {
          setLogs(logs.reverse())
        })
      })
      .catch((error) => {
        console.error("Error fetching logs:", error)
        setLogs([])
      })
  }

  function clearLogs() {
    invokeClearLogs()
      .then((logs) => {
        setLogs(logs)
        setShowCheck(true)
        setTimeout(() => {
          setShowCheck(false)
        }, 2000)
      })
      .catch((error) => {
        console.error("Error clearing logs:", error)
        toast({
          variant: "destructive",
          title: "Error clearing logs",
          description: error.message,
        })
      })
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="m-4 mt-auto">
        {logs
          .slice()
          .reverse()
          .map((log, index) => (
            <p
              key={index}
              className={cn(
                "text-sm text-muted-foreground",
                index === logs.length - 1 && "font-medium text-slate-400"
              )}
            >
              {log}
            </p>
          ))}
        {Array.from({ length: 4 }).map((_, index) => (
          <br key={index} />
        ))}
      </div>

      <div
        className={cn(
          "absolute bottom-4 right-4 z-10 flex items-center bg-inherit p-2 text-right"
        )}
      >
        {showCheck && (
          <Icon
            icon="lets-icons:check-fill"
            className="mr-4 h-6 w-6 animate-fade-in-out-once text-green-500"
          />
        )}
        <button
          className={cn(
            "flex items-center rounded border px-4 py-2 text-sm font-medium",
            "hover:bg-muted"
          )}
          onClick={() => clearLogs()}
        >
          <Icon icon="entypo:trash" className="mr-2" />
          Clear Logs
        </button>
      </div>
    </div>
  )
}
