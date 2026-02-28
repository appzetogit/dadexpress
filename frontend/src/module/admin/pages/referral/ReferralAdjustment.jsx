import { useState, useEffect } from "react";
import { Search, History, Info, Settings, ArrowUpCircle, ArrowDownCircle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import api, { API_ENDPOINTS } from "@/lib/api";

export default function ReferralAdjustment() {
  const [formData, setFormData] = useState({
    userSearch: "",
    action: "add",
    coins: "",
    note: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [walletHistory, setWalletHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.get(API_ENDPOINTS.REFERRAL.ADJUSTMENTS);
      if (res.data?.success) {
        setWalletHistory(res.data.data);
      }
    } catch (error) {
      console.error("Failed to load adjustment history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.userSearch || !formData.coins) {
      toast.error("User and amount are required!");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.post(API_ENDPOINTS.REFERRAL.ADJUSTMENTS, formData);
      if (res.data?.success) {
        toast.success("Adjustment saved successfully!");
        setFormData({ userSearch: "", action: "add", coins: "", note: "" });
        fetchHistory(); // Refresh history
      } else {
        toast.error(res.data?.message || "Failed to save adjustment");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to process adjustment");
      console.error("Failed to process adjustment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 bg-white min-h-screen font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <Settings className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Manual Coin Adjustment</h2>
            <p className="text-[12px] font-bold text-slate-400">Enter User Detail and Specify the reward amount</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form Section */}
          <div className="lg:col-span-2">
            <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-slate-700">User Search Name</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by User Name Or User email"
                      className="pl-10 h-11 border-slate-200 rounded-lg focus-visible:ring-green-500 font-medium text-sm w-full"
                      value={formData.userSearch}
                      onChange={(e) => setFormData({ ...formData, userSearch: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-bold text-slate-700">Adjustment Type</Label>
                    <Select
                      value={formData.action}
                      onValueChange={(val) => setFormData({ ...formData, action: val })}
                    >
                      <SelectTrigger className="h-11 border-slate-200 rounded-lg focus:ring-green-500 font-medium text-sm">
                        <SelectValue placeholder="Add Or Deduct" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">Add (Credit)</SelectItem>
                        <SelectItem value="deduct">Deduct (Debit)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-bold text-slate-700">Amount (Coins)</Label>
                    <Input
                      type="number"
                      placeholder="e.g 100"
                      className="h-11 border-slate-200 rounded-lg focus-visible:ring-green-500 font-medium text-sm"
                      value={formData.coins}
                      onChange={(e) => setFormData({ ...formData, coins: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-slate-700">Internal Notes / Remarks</Label>
                  <Textarea
                    placeholder="Enter Internal Remarks (Not visible to user)"
                    className="resize-none min-h-[120px] border-slate-200 rounded-lg focus-visible:ring-green-500 font-medium text-sm"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  />
                </div>

                <Button
                  className="w-full bg-[#10B981] hover:bg-green-600 text-white font-black h-12 rounded-lg transition-all active:scale-95 text-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Processing..." : "Save Adjustment"}
                </Button>
              </form>
            </Card>
          </div>

          {/* Right History Selection */}
          <div className="lg:col-span-1">
            <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white p-6 h-fit">
              <div className="flex items-center gap-2 mb-6">
                <History className="h-5 w-5 text-slate-400" />
                <h3 className="text-md font-bold text-slate-800">Recent Wallet History</h3>
              </div>

              <div className="space-y-6">
                {loadingHistory ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : walletHistory.length === 0 ? (
                  <div className="text-center text-slate-500 font-medium py-4 text-sm">No recent manual adjustments found.</div>
                ) : (
                  walletHistory.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 group">
                      <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${log.action === 'Credit' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {log.action === 'Credit' ? <ArrowUpCircle size={18} strokeWidth={2.5} /> : <ArrowDownCircle size={18} strokeWidth={2.5} />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-slate-800 text-sm">{log.user}</p>
                          <p className={`font-black text-sm ${log.action === 'Credit' ? 'text-green-600' : 'text-red-500'}`}>
                            {log.action === 'Credit' ? '+' : '-'}{log.coins}
                          </p>
                        </div>
                        <p className="text-[11px] font-medium text-slate-400 line-clamp-1 italic">"{log.reason}"</p>
                        <p className="text-[10px] font-bold text-slate-300 uppercase">{log.date}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-50">
                <div className="bg-slate-50 rounded-xl p-4 flex gap-3">
                  <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Changes made here will be instantly reflected in the user's wallet balance and history.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
