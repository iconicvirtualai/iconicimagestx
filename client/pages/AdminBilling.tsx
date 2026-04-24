import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { AlertCircle, CreditCard, FileText } from "lucide-react";

interface Invoice {
  id: string;
  amount: number;
  date: string;
  status: "paid" | "pending" | "overdue";
  description: string;
}

export default function AdminBilling() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const q = query(
          collection(db, "invoices"),
          orderBy("date", "desc"),
          limit(10)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Invoice[];
        setInvoices(data);
      } catch (error) {
        console.error("Error fetching invoices:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  const statusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-50 text-green-700 border-green-200";
      case "pending":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "overdue":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  return (
    <AdminLayout title="Billing">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Current Plan Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
              Current Plan
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Plan Type</p>
                <p className="text-xl font-bold text-gray-900">Professional</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Monthly Cost</p>
                <p className="text-2xl font-bold text-[#0d9488]">$299</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Renewal Date</p>
                <p className="text-lg font-semibold text-gray-900">May 24, 2026</p>
              </div>
              <button className="w-full mt-4 px-4 py-2 bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl font-semibold transition">
                Upgrade Plan
              </button>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
              Payment Methods
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <CreditCard className="w-5 h-5 text-gray-600" />
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">Visa ending in 4242</p>
                  <p className="text-xs text-gray-600">Expires 12/2026</p>
                </div>
              </div>
              <button className="w-full px-4 py-2 border border-gray-200 text-gray-900 rounded-xl font-semibold hover:bg-gray-50 transition">
                Add Payment Method
              </button>
            </div>
          </div>
        </div>

        {/* Invoice History */}
        <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">
            Invoice History
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Loading invoices...</p>
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-600">No invoices found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">
                      Date
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">
                      Description
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">
                      Amount
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-900">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-900 font-medium">
                        {new Date(invoice.date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {invoice.description}
                      </td>
                      <td className="py-3 px-4 text-gray-900 font-semibold">
                        ${invoice.amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold border">
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button className="text-[#0d9488] hover:text-[#0f766e] font-semibold text-sm flex items-center justify-center gap-1 mx-auto">
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}