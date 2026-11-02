import { useState, useEffect, useCallback } from "react";
import { Search, Download, Ban, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [exporting, setExporting] = useState(false);

  const fetchLogs = useCallback(async (targetPage = page, targetLimit = limit, targetSearch = searchQuery) => {
    try {
      setLoading(true);
      const params = {
        page: targetPage,
        limit: targetLimit
      };
      if (targetSearch?.trim()) {
        params.search = targetSearch.trim();
      }

      const res = await api.get(API_ENDPOINTS.REFERRAL.USERS, { params });
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
            referrerPhone: log.referrer?.phone || "",
            referred: log.referee?.name || "Unknown",
            referredPhone: log.referee?.phone || "",
            date: new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            rawDate: log.createdAt,
            orderStatus,
            reward,
            coins,
          };
        });
        setLogs(formattedLogs);
        if (res.data.data.pagination) {
          setPagination(res.data.data.pagination);
        }
      } else {
        setLogs([]);
        setPagination({ total: 0, pages: 1 });
      }
    } catch (error) {
      console.error("Failed to load referral logs:", error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs(page, limit, searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [page, limit, searchQuery, fetchLogs]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  const handleLimitChange = (e) => {
    const val = e.target.value === "all" ? "all" : Number(e.target.value);
    setLimit(val);
    setPage(1);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await api.get(API_ENDPOINTS.REFERRAL.USERS, {
        params: { limit: "all", search: searchQuery }
      });
      const exportList = res.data?.data?.logs || [];
      if (!exportList.length) {
        alert("No records to export");
        return;
      }

      const rows = [
        ["REFERRER", "REFERRER PHONE", "REFERRED USER", "REFERRED PHONE", "SIGNUP DATE", "ORDER STATUS", "REWARD", "COINS"]
      ];

      exportList.forEach(log => {
        let orderStatus = "Pending";
        let reward = "Waiting";
        let coins = "-";
        if (log.status === "completed") {
          orderStatus = "Completed";
          reward = "Issued";
          coins = `${log.referrerReward || log.refereeReward || 0}`;
        } else if (log.status === "invalid" || log.status === "expired") {
          orderStatus = "Cancelled";
          reward = "Invalid";
        }
        rows.push([
          `"${log.referrer?.name || "Unknown"}"`,
          `"${log.referrer?.phone || ""}"`,
          `"${log.referee?.name || "Unknown"}"`,
          `"${log.referee?.phone || ""}"`,
          `"${new Date(log.createdAt).toLocaleDateString('en-GB')}"`,
          `"${orderStatus}"`,
          `"${reward}"`,
          `"${coins}"`
        ]);
      });

      const csvContent = "data:text/csv;charset=utf-8," + rows.map(r => r.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `referral_multiplier_log_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

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
                    placeholder="Search Referrer or Referee..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="pl-9 h-9 border-slate-200 rounded-lg focus-visible:ring-blue-600 font-medium text-sm"
                  />
                </div>
                <Button
                  onClick={handleExport}
                  disabled={exporting}
                  variant="outline"
                  className="h-9 px-4 rounded-lg border-slate-200 flex items-center gap-2 font-bold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 text-xs"
                >
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 pb-2 pt-2 overflow-x-auto">
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
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center font-medium text-slate-500">
                        {searchQuery ? `No referral records found matching "${searchQuery}".` : "No referral records found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id} className="border-b border-slate-50 group transition-colors hover:bg-slate-50/50">
                        <TableCell className="py-3.5 px-4 font-bold text-xs text-slate-800 tracking-tight">
                          <div>{log.referrer}</div>
                          {log.referrerPhone && <div className="text-[10px] text-slate-400 font-normal">{log.referrerPhone}</div>}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 font-medium text-xs text-slate-500">
                          <div>{log.referred}</div>
                          {log.referredPhone && <div className="text-[10px] text-slate-400 font-normal">{log.referredPhone}</div>}
                        </TableCell>
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
                          <button className="text-slate-200 hover:text-red-500 transition-colors" title="Block user">
                            <Ban className="h-4 w-4 mx-auto" strokeWidth={2.5} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {pagination.total > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                  <span>
                    Showing {pagination.total === 0 ? 0 : (page - 1) * (limit === "all" ? pagination.total : limit) + 1} to{" "}
                    {limit === "all" ? pagination.total : Math.min(page * limit, pagination.total)} of{" "}
                    <strong className="text-slate-800 font-bold">{pagination.total}</strong> referrals
                  </span>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <span>Rows per page:</span>
                    <select
                      value={limit}
                      onChange={handleLimitChange}
                      className="border border-slate-200 rounded px-2 py-1 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600 font-semibold"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value="all">All</option>
                    </select>
                  </div>
                </div>

                {pagination.pages > 1 && limit !== "all" && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className="h-8 px-2.5 rounded-lg border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Previous
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: pagination.pages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === pagination.pages || (p >= page - 2 && p <= page + 2))
                        .map((p, idx, arr) => {
                          const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                          return (
                            <div key={p} className="flex items-center gap-1">
                              {showEllipsis && <span className="text-slate-400 text-xs px-1">...</span>}
                              <button
                                onClick={() => setPage(p)}
                                className={`h-8 min-w-[32px] px-2 rounded-lg text-xs font-bold transition-all ${
                                  page === p
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-slate-600 hover:bg-slate-100 border border-slate-200"
                                }`}
                              >
                                {p}
                              </button>
                            </div>
                          );
                        })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === pagination.pages}
                      onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                      className="h-8 px-2.5 rounded-lg border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
