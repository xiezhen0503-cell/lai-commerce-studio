import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { getCommerceService } from "@lai/shared";
import { Badge, PageHead, statusLabel, statusTone } from "@/components/ui";
export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  const projects = getCommerceService().listProjects();
  return <><PageHead eyebrow="Projects" title="全部项目" subtitle="每个项目共享一套品牌、商品、资料、事实快照和成果版本。" action={<Link href="/projects/new" className="button primary"><Plus size={16}/>新建项目</Link>}/><div className="card table-wrap"><table><thead><tr><th>项目</th><th>任务类型</th><th>平台</th><th>事实快照</th><th>状态</th><th></th></tr></thead><tbody>{projects.map(project=><tr key={project.id}><td><strong>{project.name}</strong><div className="list-meta">{project.businessGoal}</div></td><td>{project.type}</td><td>{project.targetPlatforms.join(" / ")}</td><td className="mono">{project.currentFactSnapshotId?.slice(0,16) || "待建立"}</td><td><Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge></td><td><Link href={`/projects/${project.id}`} className="icon-button" aria-label={`打开${project.name}`}><ArrowUpRight size={15}/></Link></td></tr>)}</tbody></table></div></>;
}
