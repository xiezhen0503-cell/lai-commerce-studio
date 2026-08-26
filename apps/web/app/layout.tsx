import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = { title: "小赖 AI 工作台", description: "不会写提示词也能使用的中文电商 AI 工作台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><div className="app-shell"><Sidebar/><main className="main"><header className="topbar"><div className="crumb">新手模式 · 一句话开始</div><div className="top-actions"><div className="demo-pill"><span className="demo-dot"/>演示数据已就绪</div><button className="icon-button" aria-label="通知"><Bell size={16}/></button><button className="avatar" aria-label="用户小赖">赖</button></div></header><div className="content">{children}</div></main></div></body></html>;
}
