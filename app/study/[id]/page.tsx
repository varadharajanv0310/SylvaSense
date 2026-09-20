import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StudyRouter from "../../ui/studies/StudyRouter";
import { STUDY_TITLES } from "../../ui/studies/titles";

const IDS = Object.keys(STUDY_TITLES);

export function generateStaticParams() {
  return IDS.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const entry = STUDY_TITLES[id];
  if (!entry) return { title: "SylvaSense — Scroll studies" };
  return {
    title: `SylvaSense — ${entry.name}`,
    description: entry.line,
  };
}

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!IDS.includes(id)) notFound();
  return <StudyRouter id={id} />;
}
