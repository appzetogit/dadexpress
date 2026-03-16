import { useEffect, useMemo, useState } from "react";
import { Search, Download, ExternalLink, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminAPI } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function RestaurantReferralMapping() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [mappings, setMappings] = useState([]);
  const [policy, setPolicy] = useState({
    commissionPercentage: 5,
    applyOn: "First Order Only",
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchMappings(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    fetchMappings("");
  }, []);

  const fetchMappings = async (search = "") => {
    try {
      setIsLoading(true);
      const response = await adminAPI.getRestaurantReferralMappings({
        search,
        limit: 200,
      });
      const data = response?.data?.data || {};
      setMappings(Array.isArray(data.mappings) ? data.mappings : []);
      if (data.policy) {
        setPolicy({
          commissionPercentage: data.policy.commissionPercentage ?? 5,
          applyOn: data.policy.applyOn || "First Order Only",
        });
      }
    } catch (error) {
      console.error("Error fetching restaurant referral mappings:", error);
      toast.error("Failed to fetch restaurant referral mappings.");
      setMappings([]);
    } finally {
      setIsLoading(false);
    }
  };

  const totalMappings = mappings.length;

  const exportRows = useMemo(() => {
    return mappings.map((mapping) => ({
      Referrer: mapping.referrerRestaurant?.name || "Unknown",
      "Referrer Code": mapping.referrerRestaurant?.referralCode || "-",
      Referred: mapping.referredRestaurant?.name || "Restaurant",
      "Referred Code": mapping.referredRestaurant?.referralCode || "-",
      "Joined Date": formatDate(mapping.joinedAt),
      Commission: `${Number(mapping.commissionPercentage || 0)}%`,
      Progress: `${mapping.progress?.completed || 0}/${mapping.progress?.required || 1}`,
      Status: formatStatus(mapping.status),
    }));
  }, [mappings]);

  const handleExport = () => {
    if (exportRows.length === 0) {
      toast.error("No referral mappings available to export.");
      return;
    }

    const headers = Object.keys(exportRows[0]);
    const csvRows = [
      headers.join(","),
      ...exportRows.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "restaurant-referral-mapping.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Info Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <ExternalLink className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Current Referral Policy</h3>
              <p className="text-xs text-slate-500 font-medium">
                Commission: <span className="text-blue-600 font-black">{Number(policy.commissionPercentage || 0)}%</span> | Applies On: <span className="text-blue-600 font-black">{policy.applyOn || "First Order Only"}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
             <span className="text-xs font-bold text-slate-600">Total Referrals:</span>
             <span className="text-sm font-black text-slate-900">{totalMappings}</span>
          </div>
        </div>

        <Card className="border-none shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-6 pb-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <CardTitle className="text-xl font-black text-slate-800 tracking-tight">Restaurant Referral Mapping</CardTitle>
                <p className="text-xs text-slate-400 font-medium mt-1">Track rewards and signup sources for all restaurants</p>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search Referrer or Referred..." 
                    className="pl-9 h-10 border-slate-200 rounded-xl focus-visible:ring-blue-600 font-medium text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  className="h-10 px-4 rounded-xl border-slate-200 flex items-center gap-2 font-bold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 text-xs"
                >
                  <Download className="h-4 w-4" />
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
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">REFERRER & REFERRED</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">JOINED DATE</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">COMMISSION</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">PROGRESS</TableHead>
                    <TableHead className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">STATUS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm font-medium text-slate-500">
                        Loading referral mappings...
                      </TableCell>
                    </TableRow>
                  ) : mappings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm font-medium text-slate-500">
                        No restaurant referral mappings found.
                      </TableCell>
                    </TableRow>
                  ) : mappings.map((map) => (
                    <TableRow key={map.id} className="border-b border-slate-50 group transition-colors hover:bg-slate-50/50">
                      <TableCell className="py-4 px-4">
                        <div className="flex items-center gap-3">
                           <div className="flex flex-col">
                              <span className="font-bold text-sm text-slate-800 tracking-tight">{map.referrerRestaurant?.name || "Unknown"}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Referrer</span>
                           </div>
                           <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                           <div className="flex flex-col">
                              <span className="font-medium text-sm text-slate-600">{map.referredRestaurant?.name || "Restaurant"}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Referred</span>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-4 font-bold text-xs text-slate-500">{formatDate(map.joinedAt)}</TableCell>
                      <TableCell className="py-4 px-4">
                        <span className="font-black text-sm text-blue-600">{Number(map.commissionPercentage || 0)}%</span>
                      </TableCell>
                      <TableCell className="py-4 px-4">
                        <div className="space-y-1.5 w-24">
                          <div className="flex items-center justify-between text-[10px] font-black text-slate-400">
                             <span>{map.progress?.completed || 0}/{map.progress?.required || 1} Orders</span>
                             <span>{getProgressPercent(map)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                             <div 
                                className={`h-full transition-all duration-500 ${map.status === 'completed' ? 'bg-green-500' : 'bg-blue-400'}`}
                                style={{ width: `${getProgressPercent(map)}%` }}
                             />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider ${
                          map.status === 'completed' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                        }`}>
                          {formatStatus(map.status)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatStatus(status) {
  if (!status) return "Pending";
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function getProgressPercent(mapping) {
  const completed = Number(mapping?.progress?.completed || 0);
  const required = Number(mapping?.progress?.required || 1);
  if (required <= 0) return 0;
  return Math.min(100, Math.round((completed / required) * 100));
}
