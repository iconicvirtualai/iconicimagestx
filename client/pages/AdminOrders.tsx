import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Search, Filter, Package } from "lucide-react";

interface Order {
  id: string;
  clientName: string;
  address: string;
  status: "pending" | "in-progress" | "completed" | "cancelled";
  amount: number;
  date: string;
  orderNumber: string;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        let allOrders: Order[] = [];

        try {
          const ordersQuery = collection(db, "orders");
          const snapshot = await getDocs(ordersQuery);
          allOrders = snapshot.docs.map((doc) => ({
            id: doc.id,
            clientName: doc.data().clientName || "Unknown Client",
            address: doc.data().address || doc.data().city || "No address",
            status: doc.data().status || "pending",
            amount: doc.data().amount || 0,
            date: doc.data().date || new Date().toISOString(),
            orderNumber: doc.data().orderNumber || ("ORD-" + doc.id.slice(0, 8)),
          })) as Order[];
        } catch {
          const requestsQuery = collection(db, "orderRequests");
          const snapshot = await getDocs(requestsQuery);
          allOrders = snapshot.docs.map((doc) => ({
            id: doc.id,
            clientName: doc.data().clientName || "Unknown Client",
            address: doc.data().address || doc.data().city || "No address",
            status: doc.data().status || "pending",
            amount: doc.data().amount || 0,
            date: doc.data().date || new Date().toISOString(),
            orderNumber: doc.data().orderNumber || ("ORD-" + doc.id.slice(0, 8)),
          })) as Order[];
        }

        setOrders(allOrders);
        setFilteredOrders(allOrders);
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  useEffect(() => {
    let filtered = orders;

    if (searchTerm) {
      filtered = filtered.filter(
        (order) =>
          order.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.address.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter((order) => order.status === filterStatus);
    }

    setFilteredOrders(filtered);
  }, [searchTerm, filterStatus, orders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 text-green-700 border-green-200";
      case "in-progress":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "pending":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "cancelled":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.amount, 0);
  const completedCount = filteredOrders.filter(
    (o) => o.status === "completed"
  ).length;

  return (
    <AdminLayout title="Orders">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Total Orders
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {filteredOrders.length}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Completed
            </div>
            <p className="text-3xl font-bold text-green-600">{completedCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Total Revenue
            </div>
            <p className="text-3xl font-bold text-[#0d9488]">
              ${totalRevenue.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by client, order #, or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-[#0d9488]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#0d9488]"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 shadow-sm bg-white overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">No orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-4 px-6 font-semibold text-gray-900">
                      Order #
                    </th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-900">
                      Client
                    </th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-900">
                      Address
                    </th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-900">
                      Amount
                    </th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-900">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50 transition cursor-pointer"
                    >
                      <td className="py-4 px-6 font-semibold text-gray-900">
                        {order.orderNumber}
                      </td>
                      <td className="py-4 px-6 text-gray-900 font-medium">
                        {order.clientName}
                      </td>
                      <td className="py-4 px-6 text-gray-700 text-sm">
                        {order.address}
                      </td>
                      <td className="py-4 px-6 font-semibold text-gray-900">
                        ${order.amount.toFixed(2)}
                      </td>
                      <td className="py-4 px-6">
                        <span className={'inline-block px-3 py-1 rounded-full text-xs font-semibold border ' + getStatusColor(order.status)}>
                          {order.status === "in-progress"
                            ? "In Progress"
                            : order.status.charAt(0).toUpperCase() +
                              order.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-gray-600 text-sm">
                        {new Date(order.date).toLocaleDateString()}
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