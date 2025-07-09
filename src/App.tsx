import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"

import { Menu } from "./components/menu"
import { TailwindIndicator } from "./components/tailwind-indicator"
import { ThemeProvider } from "./components/theme-provider"
import DashboardPage from "./dashboard/page"
import { cn } from "./lib/utils"

function App() {
  const [pingResult, setPingResult] = useState("")

  useEffect(() => {
    async function ping() {
      try {
        const res = await invoke<string>("send", {
          payload: JSON.stringify({
            kind: "connect",
            creds: {
              host: "localhost",
              port: "3306",
              user: "root",
              name: "mulearn",
              password: "1234567890",
            },
          }),
        })
        setPingResult(res)
      } catch (e) {
        console.error("Ping failed:", e)
        setPingResult("error")
      }
    }

    ping()
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="h-screen overflow-clip">
        <p>{pingResult}</p>
        <Menu />
        <div
          className={cn(
            "h-screen overflow-auto border-t bg-background pb-8",
            // "scrollbar-none"
            "scrollbar scrollbar-track-transparent scrollbar-thumb-accent scrollbar-thumb-rounded-md"
          )}
        >
          <DashboardPage />
        </div>
      </div>
      <TailwindIndicator />
    </ThemeProvider>
  )
}

export default App
