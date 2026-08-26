import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = { title: "小赖电商工作台", description: "项目制中文电商 AI 内容生产平台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><div className="app-shell"><Sidebar/><main className="main"><header className="topbar"><div className="crumb">项目制电商内容生产中台</div><div className="top-actions"><div className="demo-pill"><span className="demo-dot"/>本地 Mock</div><button className="icon-button" aria-label="通知"><Bell size={16}/></button><button className="avatar" aria-label="用户小赖">赖</button></div></header><div className="content">{children}</div></main></div></body></html>;
}
