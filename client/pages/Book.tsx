import { Navigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import BookingForm from "@/components/BookingForm";
import { isStudioRoomId, STUDIO105_PATHS, STUDIO_PODCAST_ID } from "@shared/studio105";

export default function BookPage() {
  const [params] = useSearchParams();
  const requested = (params.get("service") || params.get("package") || "").trim();
  // Noir and Blanc stay on the Studio 105 request form. Podcast stays on /book
  // once the catalog price is set, so it uses the same checkout as other packages.
  if (isStudioRoomId(requested) && requested !== STUDIO_PODCAST_ID) {
    return <Navigate to={`${STUDIO105_PATHS.book}?room=${requested}`} replace />;
  }
  return (
    <Layout>
      <div className="bg-white text-neutral-950">
        <div className="px-4 pb-10 pt-32 sm:px-10 sm:pb-12 sm:pt-36">
          <BookingForm />
        </div>
      </div>
    </Layout>
  );
}
