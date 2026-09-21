import { ProjectPage } from "@/features/projects/project-page";
export default async function ProjectRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectPage key={projectId} projectId={projectId} />;
}
