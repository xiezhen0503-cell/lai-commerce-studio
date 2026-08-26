import { getCommerceService, DEMO_PROJECT_ID } from "@lai/shared";
import { BeginnerWorkbench } from "@/components/beginner-workbench";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const service = getCommerceService();
  const data = service.getProject(DEMO_PROJECT_ID);
  const product = data.products[0];
  const confirmedFacts = data.facts.filter((fact) => ["verified", "user-confirmed"].includes(fact.status));
  const pendingFacts = data.facts.filter((fact) => ["missing", "conflicting", "expired"].includes(fact.status));

  return <BeginnerWorkbench initial={{
    projectId: data.project.id,
    projectName: data.project.name,
    productName: product?.name ?? "演示商品",
    specification: product?.specification ?? "规格待补充",
    platforms: data.project.targetPlatforms,
    sourceNames: data.sources.map((source) => source.fileName),
    confirmedFacts: confirmedFacts.map((fact) => ({ type: fact.type, value: fact.value })),
    pendingFactNames: pendingFacts.map((fact) => fact.type)
  }}/>;
}
