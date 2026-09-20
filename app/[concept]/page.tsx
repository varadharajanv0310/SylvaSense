import { notFound } from "next/navigation";
import Experience from "../ui/Experience";
export function generateStaticParams() { return [1,2,3,4,5,6,7,8].map(n=>({concept:`concept-0${n}`})); }
export default async function ConceptPage({params}:{params:Promise<{concept:string}>}) {
  const {concept} = await params;
  if(!/^concept-0[1-8]$/.test(concept)) notFound();
  return <Experience id={concept.slice(-2)}/>;
}
