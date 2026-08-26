import Link from "next/link";
import { Bot, FileCheck2, FolderKanban, Home, Library, PackageSearch, PanelsTopLeft, ScrollText, Settings2, Sparkles, WandSparkles, Workflow } from "lucide-react";

const daily = [
  ["/", "AI 工作台", Home],
  ["/projects", "我的项目", FolderKanban],
  ["/reviews", "待我确认", FileCheck2],
  ["/products", "商品资料", PackageSearch],
  ["/knowledge", "素材资料", Library]
] as const;

const advanced = [
  ["/prompt-lab", "提示词工坊", WandSparkles],
  ["/jobs", "生成任务", Workflow],
  ["/templates", "内容模板", PanelsTopLeft],
  ["/skills", "电商技能", Sparkles],
  ["/agents", "智能体接入", Bot],
  ["/agents/logs", "调用日志", ScrollText],
  ["/api-docs", "接口文档", ScrollText],
  ["/settings/integrations", "外部服务", Settings2]
] as const;

const NavItems = ({ items }: { items: typeof daily | typeof advanced }) => <>{items.map(([href,label,Icon]) => <Link className="nav-link" href={href} key={href}><Icon aria-hidden="true"/><span>{label}</span></Link>)}</>;

export function Sidebar() {
  return <aside className="sidebar" aria-label="主导航">
    <div className="brand-mark"><div className="brand-glyph">赖</div><div className="brand-copy"><div className="brand-name">小赖 AI 工作台</div><div className="brand-sub">不会提示词，也能开始</div></div></div>
    <nav className="nav-group"><div className="nav-label">日常使用</div><NavItems items={daily}/></nav>
    <details className="advanced-nav"><summary>高级功能</summary><nav><NavItems items={advanced}/></nav></details>
    <div className="sidebar-foot"><strong>新手模式已开启</strong><p>你只管说想做什么。资料、提示词、事实检查和输出结构由工作台整理。</p></div>
  </aside>;
}
