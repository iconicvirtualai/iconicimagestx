import AdminLayout from "@/components/AdminLayout";
import { StudioHomePanel } from "@/components/studio/StudioShell";

export default function AdminStudioHome() {
  return (
    <AdminLayout title="Studio">
      <StudioHomePanel />
    </AdminLayout>
  );
}
