import { useEffect, useRef, useState } from "react"
import { invokeDbConnection, invokeDbDisconnect, invokeDbInfo } from "@/api/db"
import { Icon } from "@iconify/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@radix-ui/react-dropdown-menu"
import {
  CaretSortIcon,
  CheckIcon,
  PlusCircledIcon,
} from "@radix-ui/react-icons"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Icons } from "@/components/icons"
import { DbData } from "@/components/types"

interface ConnectionSelectorProps {
  dbList: DbData[]
  dbData: DbData | null
  setDbData: (info: DbData | null) => void
}

export default function ConnectionSelector({
  dbList,
  dbData,
  setDbData,
}: ConnectionSelectorProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [open, setOpen] = useState(false)
  const [newDbInfo, setNewDbInfo] = useState<DbData | null>(null)
  const [dbConnecting, setDbConnecting] = useState(false)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [menuWidth, setMenuWidth] = useState<number | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    fetchDbInfo()

    setTimeout(() => {
      if (triggerRef.current) {
        setMenuWidth(triggerRef.current.offsetWidth)
      }
    }, 1000)
  }, [])

  useEffect(() => {
    if (triggerRef.current) {
      setMenuWidth(triggerRef.current.offsetWidth)
    }
  }, [dbData])

  const handleErrorField = (error: string) => {
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

  function fetchDbInfo() {
    setDbConnecting(true)

    invokeDbInfo().then((payload) => {
      setDbData({ ...payload })
      setDbConnecting(false)
    })
  }

  function initiateDbConnection() {
    setDbConnecting(true)

    invokeDbConnection({
      host: newDbInfo?.host || "localhost",
      port: newDbInfo?.port || "3306",
      user: newDbInfo?.user ?? "root",
      name: newDbInfo?.name ?? "",
      password: newDbInfo?.password ?? "",
    })
      .then((success) => {
        if (success) {
          fetchDbInfo()
          setNewDbInfo((prev) => ({
            ...prev!,
            connected: true,
          }))

          setTimeout(() => {
            setNewDbInfo(null)
            setShowDialog(false)
          }, 1000)
        } else {
          throw new Error("Connection failed")
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
      .finally(() => {
        setDbConnecting(false)
      })
  }

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[200px]"
            ref={triggerRef}
          >
            {dbData?.connected ? (
              <>
                <div>
                  <Icon
                    icon="ix:circle-dot"
                    className="mr-2 h-4 w-4 animate-pulse text-green-500"
                  />
                </div>
                <div className="truncate">
                  <p className="truncate">{dbData.name}</p>
                </div>
              </>
            ) : (
              <div className="flex items-center">
                <Icon
                  icon="ix:circle-dot"
                  className="mr-2 h-4 w-4 text-red-500"
                />
                {"Not Connected"}
              </div>
            )}
            <div className="ml-auto">
              <Icon
                icon="radix-icons:caret-sort"
                className="ml-3 h-4 w-4 text-muted-foreground"
              />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder="Search connections..." />
            <CommandEmpty>No DB found.</CommandEmpty>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem onSelect={fetchDbInfo}>
                <Icon
                  icon="mdi:refresh"
                  className={cn("mr-2 h-4 w-4", dbConnecting && "animate-spin")}
                />
                Refresh
              </CommandItem>

              <CommandItem
                onSelect={(e) => {
                  dbData?.connected &&
                    invokeDbDisconnect().then(() => setDbData(null))
                }}
              >
                <Icon icon="mdi:power" className="mr-2 h-4 w-4 text-red-500" />
                Disconnect
              </CommandItem>

              <CommandItem
                onSelect={(e) => {
                  dbData?.connected &&
                    invokeDbDisconnect().then(() => setDbData(null))
                }}
              >
                <Icon
                  icon="solar:database-bold-duotone"
                  className="mr-2 h-4 w-4 text-red-500"
                />
                Remove
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Connections">
              {dbList.map((conn) => (
                <CommandItem
                  key={conn.name}
                  onSelect={() => {
                    setDbData(conn)
                    setOpen(false)
                  }}
                >
                  <Icon
                    icon="solar:database-bold-duotone"
                    className={cn(
                      "mr-2 h-4 w-4",
                      conn.connected ? "text-green-500" : "text-red-500"
                    )}
                  />
                  {conn.name}
                  <CheckIcon
                    className={cn(
                      "ml-auto h-4 w-4",
                      dbData?.name === conn.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandList>
              <CommandGroup>
                <DialogTrigger asChild>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false)
                      setShowDialog(true)
                    }}
                  >
                    <Icon
                      icon="mdi:plus-circle-outline"
                      className="mr-2 h-4 w-4"
                    />
                    New Connection
                  </CommandItem>
                </DialogTrigger>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a DB Connection</DialogTitle>
          <DialogDescription>
            Fill the connection details to connect to a new database.
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
          <Button variant="outline" onClick={() => setShowDialog(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            className={
              "min-w-[100px] " +
              (newDbInfo?.connected
                ? " cursor-not-allowed bg-green-600 text-white hover:bg-green-600"
                : dbConnecting
                  ? "cursor-not-allowed"
                  : "hover:bg-accent")
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
