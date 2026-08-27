import { PromptLab } from "@/components/prompt-lab";
import { PageHead } from "@/components/ui";
import { getCommerceService } from "@lai/shared";
export const dynamic="force-dynamic";
export default function PromptLabPage(){const service=getCommerceService();const projects=service.listProjects().map((project)=>{const data=service.getProject(project.id);return {id:project.id,name:project.name,productName:data.products[0]?.name||"待从资料识别商品",platforms:project.targetPlatforms};});return <><PageHead eyebrow="Prompt Lab" title="提示词工坊" subtitle="从业务任务出发，自动补齐当前项目事实，一次生成简易、专业与智能体交接三个版本。"/><PromptLab projects={projects}/></>}
