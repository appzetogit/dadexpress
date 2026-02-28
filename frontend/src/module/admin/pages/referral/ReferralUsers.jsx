import { useState, useEffect } from "react";
import { Search, Download, Ban, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api, { API_ENDPOINTS } from "@/lib/api";

export default function ReferralUsers() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get(API_ENDPOINTS.REFERRAL.USERS);
      if (res.data?.success && res.data.data?.logs) {
        const formattedLogs = res.data.data.logs.map((log) => {
          let orderStatus = "Pending";
          let reward = "Waiting";
          let coins = "-";

          if (log.status === "completed") {
            orderStatus = "Completed";
            reward = "Issued";
            coins = `+${log.referrerReward || log.refereeReward || 0}`;
          } else if (log.status === "invalid" || log.status === "expired") {
            orderStatus = "Cancelled";
            reward = "Invalid";
          }

          return {
            id: log._id,
            referrer: log.referrer?.name || "Unknown",
            referred: log.referee?.name || "Unknown",
            date: new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            orderStatus,
            reward,
            coins,
          };
        });
        setLogs(formattedLogs);
      }
    } catch (error) {
      console.error("Failed to load referral logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.referrer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.referred.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="max-w-7xl mx-auto">
        <Card className="border-none shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-6 pb-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <CardTitle className="text-xl font-black text-slate-800 tracking-tight">Referral Multiplier Log</CardTitle>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search Referrer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 border-slate-200 rounded-lg focus-visible:ring-blue-600 font-medium text-sm"
                  />
                </div>
                <Button variant="outline" className="h-9 px-4 rounded-lg border-slate-200 flex items-center gap-2 font-bold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 pb-6 pt-2 overflow-x-auto">
              <Table>
                <TableHeader className="bg-transparent border-b border-slate-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">REFERRER</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">REFERRED USER</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">SIGNUP DATE</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">ORDER STATUS</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">REWARD</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">COINS</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 text-center">BLOCK</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-48 text-center">
                        <div className="flex items-center justify-center">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center font-medium text-slate-500">
                        No referral records found matching "{searchQuery}".
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id} className="border-b border-slate-50 group transition-colors hover:bg-slate-50/50">
                        <TableCell className="py-3.5 px-4 font-bold text-xs text-slate-800 tracking-tight">{log.referrer}</TableCell>
                        <TableCell className="py-3.5 px-4 font-medium text-xs text-slate-500">{log.referred}</TableCell>
                        <TableCell className="py-3.5 px-4 font-medium text-[11px] text-slate-400">{log.date}</TableCell>
                        <TableCell className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-md font-black text-[9px] uppercase tracking-wider ${log.orderStatus === 'Completed' ? 'bg-green-50 text-green-600' :
                            log.orderStatus === 'Pending' ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
                            }`}>
                            {log.orderStatus}
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-md font-black text-[9px] uppercase tracking-wider ${log.reward === 'Issued' ? 'bg-blue-50 text-blue-600' :
                            log.reward === 'Waiting' ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
                            }`}>
                            {log.reward}
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5 px-4">
                          <span className={`font-black text-xs ${log.coins === '-' ? 'text-slate-200' : 'text-blue-600'}`}>
                            {log.coins}
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-center">
                          <button className="text-slate-200 hover:text-red-500 transition-colors">
                            <Ban className="h-4 w-4 mx-auto" strokeWidth={2.5} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
