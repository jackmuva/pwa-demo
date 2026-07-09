"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function Home() {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  useEffect(() => {
    const pageDiv = document.getElementById("mainDiv");
    const handlePointerUp = (event: PointerEvent) => {
      const blDevices: BluetoothDevice[] = [];
      console.log("ready");
      navigator.bluetooth.requestDevice({ acceptAllDevices: true })
        .then(device => {
          console.log(device);
          blDevices.push(device);
        })
        .catch(error => { console.error(error); });
      setDevices(blDevices);
    }

    pageDiv?.addEventListener('pointerup', handlePointerUp);

    return () => {
      pageDiv?.removeEventListener("pointerup", handlePointerUp);
    }
  }, [])
  return (
    <div id="mainDiv" className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans text-black">
      Plaud PWA Demo
      {devices.map((device) => {
        return (<div>{device.name}</div>);
      })}
    </div>
  );
}
