import { getCommerceService, DEMO_PROJECT_ID } from "@lai/shared";
import { getTextProviderStatus } from "@lai/providers";
import { cookies } from "next/headers";
import { BeginnerWorkbench } from "@/components/beginner-workbench";
import { isWorkbenchAccessRequired, isWorkbenchAccessTokenValid, WORKBENCH_ACCESS_COOKIE } from "@/workbench-access";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (isWorkbenchAccessRequired()) {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(WORKBENCH_ACCESS_COOKIE)?.value;
    if (!isWorkbenchAccessTokenValid(accessToken)) {
      return <section className="card card-pad" style={{ maxWidth: 680, margin: "9vh auto", padding: 34 }}>
        <div className="eyebrow">受保护的测试工作台</div>
        <h1 style={{ margin: "12px 0 10px", fontSize: 30 }}>请使用小赖的专属测试链接</h1>
        <p className="subtitle" style={{ lineHeight: 1.8 }}>这个页面已经上线，但生成能力只向持有测试链接的人开放，避免公开的 AI 模型额度被滥用。请重新点击发给你的完整链接。</p>
      </section>;
    }
  }
  const service = getCommerceService();
  const data = service.getProject(DEMO_PROJECT_ID);
  const product = data.products[0];
  const confirmedFacts = data.facts.filter((fact) => ["verified", "user-confirmed", "inferred"].includes(fact.status));
  const pendingFacts = data.facts.filter((fact) => ["missing", "conflicting", "expired"].includes(fact.status));
  const ai = getTextProviderStatus();

  return <BeginnerWorkbench initial={{
    projectId: data.project.id,
    projectName: data.project.name,
    productName: product?.name ?? "演示商品",
    specification: product?.specification ?? "规格待补充",
    platforms: data.project.targetPlatforms,
    sourceNames: data.sources.map((source) => source.fileName),
    confirmedFacts: confirmedFacts.map((fact) => ({ type: fact.type, value: fact.value })),
    pendingFactNames: pendingFacts.map((fact) => fact.type),
    ai
  }}/>;
}
