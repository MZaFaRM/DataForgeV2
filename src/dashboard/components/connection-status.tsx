import { useEffect, useRef, useState } from "react"
import {
  invokeDbConnection,
  invokeDbDeletion,
  invokeDbDisconnect,
  invokeDbInfo,
  invokeDbReconnection,
  invokeListDbCreds,
} from "@/api/db"
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
import { DBCreds } from "@/components/types"

interface ConnectionSelectorProps {
  dbCreds: DBCreds | null
  setDbCreds: (info: DBCreds | null) => void
}

export default function ConnectionSelector({
  dbCreds,
  setDbCreds,
}: ConnectionSelectorProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [open, setOpen] = useState(false)
  const [newDbCreds, setNewDbCreds] = useState<DBCreds | null>(null)
  const [dbConnecting, setDbConnecting] = useState(false)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [dbList, setDbList] = useState<DBCreds[]>([])

  useEffect(() => {
    // console.log(dbCreds, dbList, "dbs");
  }, [dbCreds, dbList])

  useEffect(() => {
    console.log("ID:", dbCreds?.id)
    handleListDbCreds()
    handleSavedDbCreds()
  }, [])

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

  function handleSavedDbCreds() {
    setDbConnecting(true)
    invokeDbInfo()
      .then((payload) => {
        if (payload && payload.id) {
          handleListDbCreds()
          setDbCreds(payload)
        }
      })
      .catch((error) => {
        console.error("Error fetching database info:", error)
        setDbCreds(null)
      })
      .finally(() => {
        setDbConnecting(false)
      })
  }

  function handleListDbCreds() {
    invokeListDbCreds()
      .then((creds) => {
        if (creds.length > 0) {
          setDbList(creds)
          // console.log("Fetched database credentials:", creds)
        } else {
          setDbList([])
        }
      })
      .catch((error) => {
        console.error("Error fetching database credentials:", error)
        setDbList([])
      })
  }

  function handleDbDisconnect() {
    invokeDbDisconnect()
      .then(() => {
        setDbCreds(null)
        // console.log("Disconnected from the database.")
      })
      .catch((error) => {
        console.error("Error disconnecting from the database:", error)
      })
  }

  async function handleDbCredsSelect(creds: DBCreds) {
    setDbConnecting(true)
    setDbCreds({ ...creds, id: undefined })
    console.log(creds)
    try {
      const data = await invokeDbReconnection(creds)
      // console.log("Reconnected to the database:", creds)
      setDbCreds(data)
      setOpen(false)
      setNewDbCreds(null)
    } catch (error) {
      console.error("Error reconnecting to the database:", error)
    } finally {
      setDbConnecting(false)
      handleSavedDbCreds()
    }
  }

  function handleDbCredsRemove(creds: DBCreds) {
    invokeDbDeletion(creds)
      .then(() => {
        handleDbDisconnect()
        handleListDbCreds()
      })
      .catch((error) => {
        console.error("Error removing database connection:", error)
      })
  }

  function handleNewDbConnection() {
    setDbConnecting(true)

    invokeDbConnection({
      host: newDbCreds?.host || "localhost",
      port: newDbCreds?.port || "3306",
      user: newDbCreds?.user ?? "root",
      name: newDbCreds?.name ?? "",
      password: newDbCreds?.password ?? "",
    })
      .then((res) => {
        // console.log("Connected to the database:", res)
        if (res) {
          handleListDbCreds()
          setDbCreds(res)

          setTimeout(() => {
            setNewDbCreds(null)
            setShowDialog(false)
          }, 1000)
        } else {
          throw new Error("Connection failed")
        }
      })
      .catch((error) => {
        setNewDbCreds((prev) => ({
          ...prev!,
          error: handleErrorField(error?.message || String(error)),
        }))

        setTimeout(() => {
          setErrorField(null)
          setNewDbCreds((prev) => ({
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
    <div className="relative">
      {dbConnecting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-muted">
          <Icon
            icon="fontisto:spinner-fidget"
            className="h-4 w-4 animate-spin text-muted-foreground"
          />
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn("w-[200px]", dbConnecting && "cursor-wait")}
            >
              {dbCreds?.name ? (
                <>
                  <div className={cn(dbConnecting && "cursor-wait")}>
                    <Icon
                      icon="ix:circle-dot"
                      className={cn(
                        "mr-2 h-4 w-4",
                        dbCreds.id
                          ? "animate-pulse text-green-500"
                          : "text-red-500"
                      )}
                    />
                  </div>
                  <div className="truncate">
                    <p className="truncate">{dbCreds.name}</p>
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
                <CommandItem onSelect={handleSavedDbCreds}>
                  <Icon
                    icon="mdi:refresh"
                    className={cn(
                      "mr-2 h-4 w-4",
                      dbConnecting && "animate-spin"
                    )}
                  />
                  Refresh
                </CommandItem>
                {dbCreds?.name && (
                  <>
                    <CommandItem
                      onSelect={() => !dbConnecting && handleDbDisconnect()}
                    >
                      <Icon
                        icon="mdi:power"
                        className="mr-2 h-4 w-4 text-red-500"
                      />
                      Disconnect
                    </CommandItem>

                    <CommandItem
                      onSelect={() =>
                        !dbConnecting && handleDbCredsRemove(dbCreds)
                      }
                    >
                      <Icon
                        icon="solar:database-bold-duotone"
                        className="mr-2 h-4 w-4 text-red-500"
                      />
                      Remove
                    </CommandItem>
                  </>
                )}
              </CommandGroup>

              <CommandGroup heading="Connections">
                {dbList.map((conn) => (
                  <CommandItem
                    key={conn.name}
                    className={cn(dbConnecting && "cursor-wait")}
                    onSelect={() => {
                      handleDbCredsSelect(conn)
                    }}
                  >
                    <div>
                      <Icon
                        icon="solar:database-bold-duotone"
                        className={cn(
                          "mr-2 h-4 w-4",
                          dbCreds?.id === conn.id
                            ? "text-green-500"
                            : "text-red-500"
                        )}
                      />
                    </div>
                    <div className="truncate">
                      <p className="truncate">{conn.name}</p>
                    </div>

                    <CheckIcon
                      className={cn(
                        "ml-auto h-4 w-4",
                        dbCreds?.name === conn.name
                          ? "opacity-100"
                          : "opacity-0"
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
                    defaultValue={newDbCreds?.host || "localhost"}
                    onChange={(e) =>
                      setNewDbCreds((prev) => ({
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
                    defaultValue={newDbCreds?.port || "3306"}
                    onChange={(e) =>
                      setNewDbCreds((prev) => ({
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
                    defaultValue={newDbCreds?.user || "root"}
                    onChange={(e) =>
                      setNewDbCreds((prev) => ({
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
                    defaultValue={newDbCreds?.name || ""}
                    onChange={(e) =>
                      setNewDbCreds((prev) => ({
                        ...prev!,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div
                className={
                  "space-y-2 " +
                  (errorField === "password" ? "text-red-500" : "")
                }
              >
                <Label htmlFor="password">Password</Label>
                <div className="relative flex items-center">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    defaultValue={newDbCreds?.password || ""}
                    onChange={(e) =>
                      setNewDbCreds((prev) => ({
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
            {newDbCreds?.error && (
              <p className="text-center text-sm text-red-500">
                {newDbCreds.error}
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
                (newDbCreds?.id
                  ? " cursor-not-allowed bg-green-600 text-white hover:bg-green-600"
                  : dbConnecting
                    ? "cursor-not-allowed"
                    : "hover:bg-accent")
              }
              onClick={() => {
                handleNewDbConnection()
              }}
            >
              {newDbCreds?.id ? (
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
    </div>
  )
}
