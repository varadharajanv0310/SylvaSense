import type { Metadata } from "next";
import ConsolePage from "../ui/console/ConsolePage";

export const metadata: Metadata = {
  title: "SylvaSense — The console",
  description:
    "Run the SylvaSense backend on any area: convergence of evidence, disturbance detection and GEDI-calibrated biomass, with every number carrying its source and its interval.",
};

export default function Console() {
  return <ConsolePage />;
}
