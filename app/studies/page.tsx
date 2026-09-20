import type { Metadata } from "next";
import StudyIndex from "../ui/studies/StudyIndex";

export const metadata: Metadata = {
  title: "SylvaSense — Scroll studies",
  description:
    "Nineteen scroll-driven studies of the same story: ten independent directions and nine merges built from them.",
};

export default function Studies() {
  return <StudyIndex />;
}
