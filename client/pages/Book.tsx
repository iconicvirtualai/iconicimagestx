import Layout from "@/components/Layout";
import BookingForm from "@/components/BookingForm";

export default function BookPage() {
  return (
    <Layout>
      <div className="bg-white">
        <div style={{ padding: "40px" }}>
          <BookingForm />
        </div>
      </div>
    </Layout>
  );
}
