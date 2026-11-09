import { Navigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import BookingForm from "@/components/BookingForm";
import { isStudioRoomId, studioRoomRequestHref } from "@shared/studio105";

export default function BookPage() {
  const [params] = useSearchParams();
  const requested = (params.get("service") || params.get("package") || "").trim();
  if (isStudioRoomId(requested)) {
    return <Navigate to={studioRoomRequestHref(requested)} replace />;
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
