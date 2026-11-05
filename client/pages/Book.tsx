import Layout from "@/components/Layout";
import BookingForm from "@/components/BookingForm";

export default function BookPage() {
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
