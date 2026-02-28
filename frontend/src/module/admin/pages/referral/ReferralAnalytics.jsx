import { useState, useEffect } from "react";
import { Users, UserCheck, Coins, IndianRupee, LayoutPanelLeft, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from "recharts";
import api, { API_ENDPOINTS } from "@/lib/api";

// Data is now fetched dynamically from the API endpoint
export default function ReferralAnalytics() {
  const [filter, setFilter] = useState("7days");
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    totalRewardsSpent: 0,
    revenueGenerated: 0,
    areaData: [],
    barData: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [filter]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const days = filter === "7days" ? 7 : 30;
      const res = await api.get(API_ENDPOINTS.REFERRAL.ANALYTICS, { params: { days } });
      if (res.data?.success) {
        setStats(res.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch referral analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const getConvRate = () => {
    if (stats.total === 0) return 0;
    return ((stats.completed / stats.total) * 100).toFixed(1);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-100px)]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Referral Analytics</h2>
            <p className="text-[12px] font-bold text-slate-400">Track your referral program performance</p>
          </div>
          <div className="bg-white border rounded-lg p-0.5 flex gap-0.5 shadow-sm">
            <Button
              variant={filter === "7days" ? "default" : "ghost"}
              className={`h-8 px-3 text-[11px] font-bold rounded-md ${filter === "7days" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              onClick={() => setFilter("7days")}
            >
              Last 7 Days
            </Button>
            <Button
              variant={filter === "30days" ? "default" : "ghost"}
              className={`h-8 px-3 text-[11px] font-bold rounded-md ${filter === "30days" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              onClick={() => setFilter("30days")}
            >
              Last 30 Days
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Referrals" value={stats.total} subtitle="Across all time" icon={Users} color="blue" />
          <StatCard title="Conversions" value={stats.completed} subtitle={`${getConvRate()}% Conv. Rate`} icon={UserCheck} color="green" />
          <StatCard title="Coins Issued" value={stats.totalRewardsSpent} subtitle={`₹${stats.totalRewardsSpent} value`} icon={Coins} color="purple" />
          <StatCard title="Revenue Generated" value={`₹${stats.revenueGenerated}`} subtitle="From referred orders" icon={IndianRupee} color="orange" />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-none shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="pb-1 px-6 pt-5">
              <CardTitle className="text-lg font-black text-slate-800">Referrals vs Conversions</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-5">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.areaData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" hide />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: 600 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '11px' }} />
                    <Area type="monotone" dataKey="referrals" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRef)" />
                    <Area type="monotone" dataKey="conversions" stroke="#10B981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorConv)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="pb-1 px-6 pt-5">
              <CardTitle className="text-lg font-black text-slate-800">Coin Distribution & Usage</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-5">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.barData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: 600 }} dy={5} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: 600 }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '11px' }} />
                    <Bar dataKey="distribution" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="usage" fill="#EC4899" radius={[4, 4, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden transition-all hover:shadow-md cursor-default">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div className={`p-3 rounded-xl ${colors[color]}`}>
            <Icon size={20} strokeWidth={2.5} />
          </div>
          <LayoutPanelLeft className="h-4 w-4 text-slate-200" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-black text-slate-800">{value}</h3>
          <p className={`text-[10px] font-black ${color === 'orange' ? 'text-slate-400' : color === 'green' ? 'text-green-600' : 'text-blue-600'}`}>{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}
