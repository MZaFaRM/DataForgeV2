import { useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { UpdateIcon } from "@radix-ui/react-icons"
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app"
import { arch } from "@tauri-apps/plugin-os"
import { open } from "@tauri-apps/plugin-shell"
import { check } from "@tauri-apps/plugin-updater"
import { GithubIcon } from "lucide-react"

import { Icons } from "./icons"
import { Button, buttonVariants } from "./ui/button"
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

export function AboutDialog() {
  const [updateText, setUpdateText] = useState("")
  const [version, setVersion] = useState("")
  const [name, setName] = useState("")
  const [tauriVersion, setTauriVersion] = useState("")
  const [arc, setArc] = useState("")
  const [downloadState, setDownloadState] = useState<{
    chunkLength: number
    contentLength: number
  }>({ chunkLength: 0, contentLength: 0 })

  getVersion().then((x) => setVersion(x))
  getName().then((x) => setName(x))
  getTauriVersion().then((x) => setTauriVersion(x))
  arch().then((x) => setArc(x))

  async function handleUpdate() {
    const update = await check()
    if (!update) {
      setUpdateText("You have the latest version.")
      return
    }

    setUpdateText(
      `found update ${update.version} from ${update.date} with notes ${update.body}`
    )
    return

    // let downloaded: number = 0
    // let contentLength: number | undefined = 0

    // await update.downloadAndInstall((event) => {
    //   switch (event.event) {
    //     case "Started":
    //       contentLength = event.data.contentLength
    //       console.log(`started downloading ${event.data.contentLength} bytes`)
    //       break
    //     case "Progress":
    //       downloaded += event.data.chunkLength
    //       console.log(`downloaded ${downloaded} from ${contentLength}`)
    //       break
    //     case "Finished":
    //       console.log("download finished")
    //       break
    //   }
    // })

    // console.log("update installed")
    // await relaunch()
  }

  return (
    <DialogContent className="overflow-clip pb-2">
      <DialogHeader className="flex items-center text-center">
        <div className="rounded-full bg-background p-[6px] text-slate-600 drop-shadow-none transition duration-1000 hover:text-slate-800 hover:drop-shadow-[0_0px_10px_rgba(0,10,50,0.50)] dark:hover:text-slate-400 ">
          <img
            src="/icon.png"
            alt="App icon"
            className="h-12 w-12 rounded-full"
          />
        </div>

        <DialogTitle className="flex flex-col items-center gap-2 pt-2">
          {name}
          <span className="flex gap-1 font-mono text-xs font-medium">
            Version {version}
          </span>
        </DialogTitle>

        <DialogDescription className=" text-foreground">
          A Database population tool.
        </DialogDescription>

        <span className="text-xs text-gray-400">{updateText}</span>
        <DialogDescription className="flex flex-row"></DialogDescription>
      </DialogHeader>

      <span className="font-mono text-xs font-medium text-gray-400">
        Tauri version: {tauriVersion}
      </span>
      <DialogFooter className="flex flex-row items-center border-t pt-2 text-slate-400 ">
        <div className="mr-auto flex flex-row gap-2">
          {/* <HomeIcon
            className="h-5 w-5 cursor-pointer transition hover:text-slate-300"
            onClick={() => open("https://github.com/MZaFaRM/DataSmith")}
          /> */}
          <GithubIcon
            className="h-5 w-5 cursor-pointer transition hover:text-slate-300 "
            onClick={() => open("https://github.com/MZaFaRM/DataSmith")}
          />
        </div>

        <Button
          type="submit"
          variant="outline"
          className="h-7 gap-1"
          onClick={() => handleUpdate()}
        >
          <UpdateIcon /> Check for Updates
        </Button>
        <DialogPrimitive.Close
          type="submit"
          className={buttonVariants({ variant: "ghost", className: "h-7" })}
        >
          Close
        </DialogPrimitive.Close>
      </DialogFooter>
    </DialogContent>
  )
}
