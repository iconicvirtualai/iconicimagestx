import AdminLayout from "@/components/AdminLayout";
import { StudioProjectsPanel } from "@/components/studio/StudioShell";

export default function AdminStudioProjects() {
  return (
    <AdminLayout title="Studio">
      <StudioProjectsPanel />
    </AdminLayout>
  );
}
