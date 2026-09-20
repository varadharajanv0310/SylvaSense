"use client";
import dynamic from "next/dynamic";
const LastBreath = dynamic(() => import("./concepts/LastBreath"));
const Orbit = dynamic(() => import("./concepts/Orbit"));
const Archive = dynamic(() => import("./concepts/Archive"));
const Ghost = dynamic(() => import("./concepts/Ghost"));
const Witness = dynamic(() => import("./concepts/Witness"));
const LastGreen = dynamic(() => import("./flagship/TheLastGreen"));
const Rain = dynamic(() => import("./forest/Rain"));
const Between = dynamic(() => import("./forest/Between"));
export default function Experience({ id }: { id: string }) {
  return id === "06" ? (
    <LastGreen />
  ) : id === "07" ? (
    <Rain />
  ) : id === "08" ? (
    <Between />
  ) : id === "01" ? (
    <LastBreath />
  ) : id === "02" ? (
    <Orbit />
  ) : id === "03" ? (
    <Archive />
  ) : id === "04" ? (
    <Ghost />
  ) : (
    <Witness />
  );
}
