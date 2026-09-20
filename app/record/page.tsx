import type { Metadata } from "next";
import RecordPage from "../ui/record/RecordPage";

export const metadata: Metadata = {
  title: "SylvaSense — The record",
  description:
    "Live readings from the SylvaSense backend: six sites on the Rondônia frontier, measured from Sentinel-1, Sentinel-2 and GEDI, with every number carrying its source and its uncertainty.",
};

export default function Record() {
  return <RecordPage />;
}
