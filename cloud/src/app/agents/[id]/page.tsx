import { Suspense } from "react";
import { AgentView } from "./AgentView";

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <AgentView params={params} />
    </Suspense>
  );
}
