import { notFound } from "next/navigation";
import { getCommerceService } from "@lai/shared";
import { PageHead } from "@/components/ui";
import { ProjectWorkspace } from "@/components/project-workspace";
export const dynamic="force-dynamic";
export default async function ProjectPage({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;let data;try{data=getCommerceService().getProject(projectId);}catch{return notFound();}const artifactVersions=data.artifacts.flatMap((artifact:any)=>getCommerceService().repo.listArtifactVersions(artifact.id));const artifacts=data.artifacts.map((artifact:any)=>({...artifact,version:artifactVersions.find((v:any)=>v.artifactId===artifact.id&&v.version===artifact.currentVersion)}));return <><PageHead eyebrow="Project Workspace" title={data.project.name} subtitle={`${data.project.type} · ${data.project.businessGoal}`}/><ProjectWorkspace initial={{...data,artifacts,artifactVersions}}/></>}
