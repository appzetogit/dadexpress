import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Share2,
  Gift,
  Users,
  Trophy,
  ChevronRight,
  CheckCircle2,
  Share
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import Lenis from "lenis";

import { restaurantAPI } from "@/lib/api";

export default function ReferAndEarn() {
  const navigate = useNavigate();

  const [referralCode, setReferralCode] = useState("REST---");
  const [referralHistory, setReferralHistory] = useState([]);
  const [referralPolicy, setReferralPolicy] = useState({ commissionPercentage: 5 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Get code from current restaurant profile
        const profileRes = await restaurantAPI.getCurrentRestaurant();
        const restaurant = profileRes.data?.data?.restaurant || profileRes.data?.restaurant;
        if (restaurant?.referralCode) {
          setReferralCode(restaurant.referralCode);
        }

        const policy = profileRes.data?.data?.referralPolicy || profileRes.data?.referralPolicy;
        if (policy) {
          setReferralPolicy(policy);
        }

        // Get referral history
        const referralsRes = await restaurantAPI.getReferrals();
        const referrals = referralsRes.data?.data?.referrals || referralsRes.data?.referrals || [];
        setReferralHistory(referrals);
      } catch (err) {
        console.error("Error fetching referral data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast.success("Referral code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const shareData = {
      title: 'DadExpress Restaurant Referral',
      text: `Join DadExpress as a Restaurant Partner using my referral code: ${referralCode} and get special commission benefits!`,
      url: window.location.origin + '/restaurant/signup?ref=' + referralCode
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        handleCopy();
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden font-sans pb-10">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-4 sticky top-0 z-50 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors active:scale-90"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h1 className="text-lg font-black text-slate-800 tracking-tight">Refer & Earn</h1>
      </div>

      <div className="px-5 py-6 space-y-6 max-w-lg mx-auto">
        {/* Banner Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1a1c1e] rounded-3xl p-6 relative overflow-hidden shadow-xl shadow-slate-200/50 border border-white/5"
        >
          <div className="absolute -top-6 -right-6 p-4 opacity-5 rotate-12">
            <Gift className="w-28 h-28 text-orange-400" />
          </div>

          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-400/5 border border-orange-400/10 rounded-full">
              <span className="text-[10px] font-black text-orange-400/80 uppercase tracking-[0.2em]">Partner Benefit</span>
            </div>
            <h2 className="text-2xl font-black text-white leading-tight uppercase italic tracking-tight">
              Invite a <span className="text-orange-400">Restaurant</span>
            </h2>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              Earn <span className="text-slate-200 font-bold underline decoration-orange-400/40 decoration-2 underline-offset-4">{referralPolicy.commissionPercentage}% Commission</span> for every restaurant that joins using your code.
            </p>
          </div>

          <div className="mt-8 relative z-10 flex items-center justify-between bg-white/[0.03] rounded-2xl p-4 border border-white/[0.05]">
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Your Code</span>
              <p className="text-xl font-black text-white tracking-widest uppercase">{referralCode}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="bg-orange-600/90 hover:bg-orange-600 p-2.5 rounded-xl text-white transition-all active:scale-90 shadow-lg shadow-orange-900/20"
              >
                {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
              <button
                onClick={handleShare}
                className="bg-white/5 hover:bg-white/10 p-2.5 rounded-xl text-white transition-all active:scale-90"
              >
                <Share2 className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* How it works */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest px-1 text-center">How it works</h3>

          <div className="grid grid-cols-1 gap-3">
            {[
              { icon: Share, title: "Share Code", desc: "Send your referral code to fellow restaurant owners.", color: "bg-blue-50 text-blue-600" },
              { icon: Users, title: "They Join", desc: "When they signup using your code, the reward is locked.", color: "bg-purple-50 text-purple-600" },
              { icon: Trophy, title: "Get Reward", desc: `Receive ${referralPolicy.commissionPercentage}% commission benefit on your next order.`, color: "bg-orange-50 text-orange-600" }
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i }}
                className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 shadow-sm"
              >
                <div className={`w-12 h-12 ${step.color} rounded-2xl flex items-center justify-center shrink-0`}>
                  <step.icon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm tracking-tight">{step.title}</h4>
                  <p className="text-slate-500 text-[11px] font-medium leading-tight mt-0.5">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Referral Stats Summary */}
        <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Referral History</h3>
              <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-full">TOTAL: {referralHistory.length.toString().padStart(2, '0')}</span>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-6 text-slate-400 text-xs font-bold uppercase tracking-widest">Loading History...</div>
              ) : referralHistory.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No referrals yet</p>
                  <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-tighter">Invite your first restaurant partner today!</p>
                </div>
              ) : (
                referralHistory.map((ref, idx) => (
                  <div key={ref.id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white border border-slate-100 rounded-lg flex items-center justify-center font-bold text-xs text-slate-600 uppercase">
                        {ref.name?.[0] || 'R'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{ref.name}</p>
                        <p className="text-[9px] text-slate-400 font-bold tracking-tight">Joined {new Date(ref.joinedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${ref.status === 'Completed'
                        ? 'bg-green-50 text-green-600 border-green-100'
                        : 'bg-yellow-50 text-yellow-600 border-yellow-100'
                      }`}>
                      {ref.status}
                    </div>
                  </div>
                ))
              )}
            </div>

            <Button
              variant="outline"
              className="w-full mt-6 rounded-2xl border-slate-200 h-10 font-bold text-slate-500 text-xs gap-2"
            >
              View Detailed Log
              <ChevronRight className="w-3 h-3" />
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
