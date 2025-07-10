import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@radix-ui/react-dropdown-menu"
import { event } from "@tauri-apps/api"
import { invoke } from "@tauri-apps/api/core"
import { set } from "date-fns"
import { Eye, EyeOff } from "lucide-react"
import { Connect } from "vite"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Icons } from "@/components/icons"
import { Request, Response } from "@/components/types"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"

interface DbInfo {
  host: string
  user: string
  port: string
  name: string
  connected?: boolean
  password?: string
  error?: string
}

export default function ConnectionStatus() {
  const [showConnectDBDialog, setShowConnectDBDialog] = useState<boolean>(false)
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null)
  const [newDbInfo, setNewDbInfo] = useState<DbInfo | null>(null)
  const [dbConnecting, setDbConnecting] = useState<boolean>(false)
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [errorField, setErrorField] = useState<string | null>(null)

  function fetchDbInfo(setDbInfo: (info: DbInfo) => void) {
    console.log("Fetching DB info...")
    setDbConnecting(true)
    setTimeout(() => {
      setDbConnecting(false)
    }, 1000)
    invoke<string>("send", {
      payload: JSON.stringify({
        kind: "get_info",
      }),
    })
      .then((unParsedResponse) => {
        const res = JSON.parse(unParsedResponse || "{}") as Response<DbInfo>
        if (res.status === "ok" && res.payload) {
          setDbInfo(res.payload)
        } else {
          console.error("Backend error:", res.error)
        }
      })
      .catch((error) => {
        console.error("Fetch error:", error)
      })
  }

  function initiateDbConnection() {
    console.log("Initiating DB connection...")
    setDbConnecting(true)

    const request: Request<DbInfo> = {
      kind: "connect",
      body: {
        host: newDbInfo?.host || "localhost",
        port: newDbInfo?.port || "3306",
        user: newDbInfo?.user ?? "root",
        name: newDbInfo?.name ?? "",
        password: newDbInfo?.password ?? "",
      },
    }

    invoke<string>("send", {
      payload: JSON.stringify(request),
    })
      .then((unParsedResponse) => {
        const res = JSON.parse(unParsedResponse || "{}") as Response<boolean>
        if (res.status === "ok") {
          fetchDbInfo(setDbInfo)
          setNewDbInfo((prev) => ({
            ...prev!,
            connected: true,
          }))

          setTimeout(() => {
            setNewDbInfo(null)
            setShowConnectDBDialog(false)
          }, 1000)
        } else {
          throw new Error(res.error || "Unknown error")
        }
      })
      .catch((error) => {
        setNewDbInfo((prev) => ({
          ...prev!,
          error: handleErrorField(error?.message || String(error)),
        }))

        setTimeout(() => {
          setErrorField(null)
          setNewDbInfo((prev) => ({
            ...prev!,
            error: "",
          }))
        }, 3000)
        console.error("Connection error:", error)
      })

    setDbConnecting(false)
  }

  function handleDisconnect() {
    console.log("Disconnecting from DB...")
    invoke<string>("send", {
      payload: JSON.stringify({
        kind: "disconnect",
      }),
    })
      .then((unParsedResponse) => {
        const res = JSON.parse(unParsedResponse || "{}") as Response<string>
        if (res.status === "ok") {
          setDbInfo(null)
          setShowConnectDBDialog(false)
        } else {
          console.error("Disconnection error:", res.error)
        }
      })
      .catch((error) => {
        console.error("Disconnection error:", error)
      })
  }

  function handleErrorField(error: string) {
    if (
      error.includes("Access denied for user") &&
      error.includes("(using password: YES)")
    ) {
      setErrorField("password")
      return "Invalid password for the user."
    } else if (error.includes("Can't connect to MySQL server")) {
      return "Unable to connect to the MySQL server. Please check the host and port."
    } else if (error.includes("Unknown database")) {
      setErrorField("name")
      return "The specified database does not exist."
    } else if (error.includes("Access denied for user")) {
      setErrorField("user")
      return "Invalid user credentials."
    } else if (error.includes("Connection refused")) {
      setErrorField("host")
      return "Connection refused. Please check the host and port."
    }
    return error
  }

  useEffect(() => {
    fetchDbInfo(setDbInfo)
  }, [])

  return (
    <Dialog open={showConnectDBDialog} onOpenChange={setShowConnectDBDialog}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex min-w-[200px] items-center justify-between rounded border px-4 py-2 hover:bg-accent hover:text-accent-foreground">
            {dbInfo?.connected ? (
              <>
                <Icon
                  icon="ix:circle-dot"
                  className="animate-fade-in animate-fade-in mr-2 h-4 w-4 animate-pulse text-green-500"
                />
                {dbInfo.name}
              </>
            ) : (
              <>
                <Icon
                  icon="ix:circle-dot"
                  className="mr-2 h-4 w-4 text-red-500"
                />
                {"Not Connected"}
              </>
            )}
            <Icon
              icon="mdi:chevron-down"
              className="ml-auto h-4 w-4 text-muted-foreground"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className={cn(
            "min-w-[200px] select-none rounded border border-t-0 bg-popover p-2 shadow",
            // ❯ animations
            "data-[state=open]:animate-in data-[state=open]:fade-in " +
              "data-[state=open]:slide-in-from-top-1/2 "
          )}
        >
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              fetchDbInfo(setDbInfo)
            }}
            className="group flex items-center rounded-t border-b px-4 py-2 hover:bg-accent  hover:text-accent-foreground "
          >
            {dbConnecting ? (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icon
                icon="mdi:refresh-circle"
                className="mr-2 h-4 w-4 group-hover:animate-spin"
              />
            )}
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              !dbInfo?.connected
                ? setShowConnectDBDialog(true)
                : handleDisconnect()
            }
            className="group flex items-center rounded-b px-4 py-2 hover:bg-accent hover:text-accent-foreground"
          >
            {dbInfo?.connected ? (
              <>
                <Icon
                  icon="ri:indeterminate-circle-fill"
                  className="mr-2 h-4 w-4 text-red-500 group-hover:animate-pulse"
                />
                {"Terminate"}
              </>
            ) : (
              <>
                <Icon
                  icon="solar:database-bold-duotone"
                  className="mr-2 h-4 w-4 text-green-500 group-hover:animate-pulse"
                />
                {"Connect"}
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogContent
        className={cn(
          // animations
          "data-[state=open]:animate-in data-[state=open]:zoom-in-95 " +
            "data-[state=open]:fade-in " +
            "data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 " +
            "data-[state=closed]:fade-out"
        )}
      >
        <DialogHeader>
          <DialogTitle>Connect to a Database</DialogTitle>
          <DialogDescription>
            Add a new database connection to insert sample data.
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="space-y-4 py-2 pb-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div
                className={
                  "space-y-2 " + (errorField === "host" ? "text-red-500" : "")
                }
              >
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  placeholder="localhost"
                  required
                  defaultValue={newDbInfo?.host || "localhost"}
                  onChange={(e) =>
                    setNewDbInfo((prev) => ({
                      ...prev!,
                      host: e.target.value,
                    }))
                  }
                />
              </div>
              <div
                className={
                  "space-y-2 " + (errorField === "port" ? "text-red-500" : "")
                }
              >
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  placeholder="3306"
                  defaultValue={newDbInfo?.port || "3306"}
                  onChange={(e) =>
                    setNewDbInfo((prev) => ({
                      ...prev!,
                      port: e.target.value,
                    }))
                  }
                />
              </div>
              <div
                className={
                  "space-y-2 " + (errorField === "user" ? "text-red-500" : "")
                }
              >
                <Label htmlFor="user">User</Label>
                <Input
                  id="user"
                  placeholder="root"
                  defaultValue={newDbInfo?.user || "root"}
                  onChange={(e) =>
                    setNewDbInfo((prev) => ({
                      ...prev!,
                      user: e.target.value,
                    }))
                  }
                />
              </div>
              <div
                className={
                  "space-y-2 " + (errorField === "name" ? "text-red-500" : "")
                }
              >
                <Label htmlFor="name">Database Name</Label>
                <Input
                  id="name"
                  required
                  defaultValue={newDbInfo?.name || ""}
                  onChange={(e) =>
                    setNewDbInfo((prev) => ({
                      ...prev!,
                      name: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div
              className={
                "space-y-2 " + (errorField === "password" ? "text-red-500" : "")
              }
            >
              <Label htmlFor="password">Password</Label>
              <div className="relative flex items-center">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  defaultValue={newDbInfo?.password || ""}
                  onChange={(e) =>
                    setNewDbInfo((prev) => ({
                      ...prev!,
                      password: e.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-2 text-muted-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="-mt-4 flex justify-center">
          {newDbInfo?.error && (
            <p className="text-center text-sm text-red-500">
              {newDbInfo.error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowConnectDBDialog(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className={
              "min-w-[100px] hover:bg-accent" +
              (newDbInfo?.connected
                ? "  cursor-not-allowed bg-green-600 text-white hover:bg-green-600"
                : dbConnecting
                  ? " cursor-not-allowed"
                  : "")
            }
            onClick={() => {
              initiateDbConnection()
            }}
          >
            {newDbInfo?.connected ? (
              "Connected!"
            ) : dbConnecting ? (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
