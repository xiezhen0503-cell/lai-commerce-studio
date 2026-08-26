import Link from "next/link";
import { Blocks, Bot, BriefcaseBusiness, FileCheck2, FolderKanban, Home, Library, PackageSearch, PanelsTopLeft, ScrollText, Settings2, Sparkles, Tags, WandSparkles, Workflow } from "lucide-react";

const groups = [
  { label: "工作", items: [["/", "工作台", Home], ["/projects", "项目", FolderKanban], ["/prompt-lab", "提示词工坊", WandSparkles], ["/jobs", "生成任务", Workflow], ["/reviews", "人工审核", FileCheck2]] },
  { label: "资产", items: [["/brands", "品牌", Tags], ["/products", "商品", PackageSearch], ["/knowledge", "资料库", Library], ["/templates", "模板", PanelsTopLeft], ["/skills", "电商技能", Sparkles]] },
  { label: "协作", items: [["/agents", "智能体接入", Bot], ["/agents/connections", "连接", Blocks], ["/agents/permissions", "权限", BriefcaseBusiness], ["/agents/logs", "调用日志", ScrollText], ["/api-docs", "接口文档", ScrollText], ["/settings/integrations", "外部服务", Settings2]] }
] as const;

export function Sidebar() {
  return <aside className="sidebar" aria-label="主导航">
    <div className="brand-mark"><div className="brand-glyph">赖</div><div className="brand-copy"><div className="brand-name">小赖电商工作台</div><div className="brand-sub">LaiCommerce Studio</div></div></div>
    {groups.map((group) => <nav className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(([href,label,Icon]) => <Link className="nav-link" href={href} key={href}><Icon aria-hidden="true"/><span>{label}</span></Link>)}</nav>)}
    <div className="sidebar-foot"><strong>Mock 演示已就绪</strong><p>无需密钥也能跑完事实、提示词、方案、脚本、图片与视频草稿。</p></div>
  </aside>;
}
