import { BuildSummaryView } from "@/components/d4/BuildSummaryView";
import { demoCharacter } from "@/lib/mock/demo-character";

export default function DemoPage() {
  return <BuildSummaryView character={demoCharacter} />;
}
