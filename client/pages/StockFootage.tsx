import { Link } from "react-router-dom";
import Layout from "@/components/Layout";

/**
 * Neighborhood stock packs are not in public/media.
 * /stock-footage redirects home. This screen is only here if that redirect is removed.
 */
export default function StockFootage() {
  return (
    <Layout>
      <section className="min-h-[70vh] bg-black text-white pt-36 pb-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400 mb-4">Library</p>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter">Stock footage is not live</h1>
          <p className="mt-6 text-lg text-gray-300">
            Neighborhood packs are not ready. This page does not show outside photos or take payment.
          </p>
          <Link to="/" className="inline-flex mt-10 text-sm font-black uppercase tracking-widest text-teal-400">
            Back home
          </Link>
        </div>
      </section>
    </Layout>
  );
}
