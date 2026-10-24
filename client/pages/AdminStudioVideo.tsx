import AdminLayout from "@/components/AdminLayout";
import { StudioSectionNav } from "@/components/studio/StudioShell";
import { VideoEditor } from "@/components/studio-video/VideoEditor";
import { useAuth } from "@/contexts/AuthContext";
import { clientVideoFlags } from "@shared/videoEditorFlags";
import { useSearchParams } from "react-router-dom";

export default function AdminStudioVideo() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const flags = clientVideoFlags({
    VITE_VIDEO_EDITOR_ENABLED: import.meta.env.VITE_VIDEO_EDITOR_ENABLED,
    VITE_VIDEO_TEMPLATES_ENABLED: import.meta.env.VITE_VIDEO_TEMPLATES_ENABLED,
    VITE_VERCEL_ENV: import.meta.env.VITE_VERCEL_ENV,
    NODE_ENV: import.meta.env.PROD ? "production" : "development",
    VERCEL: import.meta.env.PROD ? "1" : undefined,
  });

  return (
    <AdminLayout title="Video Editor">
      <StudioSectionNav active="video" />
      <VideoEditor
        listingId={params.get("listing") || "staff"}
        editorEnabled={flags.editor}
        templatesEnabled={flags.templates}
        getToken={async () => user?.getIdToken()}
      />
    </AdminLayout>
  );
}
