import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { isWorkbenchAccessRequired, isWorkbenchAccessTokenValid, WORKBENCH_ACCESS_COOKIE } from "@/workbench-access";
import "./globals.css";

export const metadata: Metadata = { title: "小赖 AI 工作台", description: "不会写提示词也能使用的中文电商 AI 工作台" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (isWorkbenchAccessRequired()) {
    const cookieStore = await cookies();
    if (!isWorkbenchAccessTokenValid(cookieStore.get(WORKBENCH_ACCESS_COOKIE)?.value)) {
      return <html lang="zh-CN"><body><main className="content"><section className="card card-pad" style={{maxWidth:680,margin:"9vh auto",padding:34}}><div className="eyebrow">受保护的商业 Demo</div><h1 style={{margin:"12px 0 10px",fontSize:30}}>请使用小赖的专属测试链接</h1><p className="subtitle" style={{lineHeight:1.8}}>项目资料、生成模型、审核与智能体能力只向持有专属链接的人开放。请重新点击收到的完整链接进入。</p></section></main></body></html>;
    }
  }
  return <html lang="zh-CN"><body><div className="app-shell"><Sidebar/><main className="main"><header className="topbar"><div className="crumb">新手模式 · 一句话开始</div><div className="top-actions"><div className="demo-pill"><span className="demo-dot"/>商业 Demo 已就绪</div><Link className="icon-button" aria-label="待审核通知" href="/reviews"><Bell size={16}/></Link><Link className="avatar" aria-label="用户小赖与设置" href="/settings/integrations">赖</Link></div></header><div className="content">{children}</div></main></div></body></html>;
}
