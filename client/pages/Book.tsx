import Layout from "@/components/Layout";
import BookingForm from "@/components/BookingForm";

export default function BookPage() {
  return (
    <Layout>
      <div className="bg-white text-neutral-950">
        <div className="px-4 py-8 sm:p-10">
          <BookingForm />
        </div>
      </div>
    </Layout>
  );
}
