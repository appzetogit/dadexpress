import React, { useState, useEffect } from "react";
import { Receipt, Search, Filter, Calendar } from "lucide-react";
import { adminAPI } from "@/lib/api";
import Loader from "@/components/Loader";
import { Badge } from "@/components/ui/badge";

export default function AdminDiningBills() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getAdminDiningBills();
      if (response.data.success) {
        setBills(response.data.data.bills || []);
      }
    } catch (error) {
      console.error("Error fetching admin dining bills:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/60">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-50 text-red-600 rounded-lg">
            <Receipt className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Dining Bills History</h1>
        </div>
        <p className="text-gray-500 ml-11">Monitor and manage all dining bill payments across the platform.</p>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bill ID</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.length > 0 ? (
                bills.map((bill) => (
                  <tr key={bill._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <span className="font-mono text-sm font-medium text-slate-700">{bill.billId}</span>
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {new Date(bill.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden">
                          {bill.user?.profileImage ? (
                            <img src={bill.user.profileImage} alt={bill.user?.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 font-bold text-xs">
                              {bill.user?.name?.charAt(0) || "U"}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-900">{bill.user?.name || "Unknown"}</span>
                          <span className="text-xs text-slate-500">{bill.user?.phone}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden flex-shrink-0">
                          {bill.restaurant?.image ? (
                            <img src={bill.restaurant.image} alt={bill.restaurant?.name} className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <span className="text-sm font-medium text-slate-900 truncate max-w-[150px]">
                          {bill.restaurant?.name || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">₹{bill.finalAmount}</span>
                        {bill.discountApplied > 0 && (
                          <span className="text-xs text-green-600 font-medium">Cashback: ₹{bill.discountApplied}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge className={`${bill.paymentStatus === 'completed' ? 'bg-green-100 text-green-700' :
                        bill.paymentStatus === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                        {bill.paymentStatus}
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Receipt className="w-12 h-12 text-slate-200 mb-3" />
                      <p className="text-lg font-medium text-slate-900">No dining bills found</p>
                      <p className="text-sm mt-1">There are no dining bill payments recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
