import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Copy, Share2, Users, Gift, CheckCircle, Clock, Smartphone, MessageCircle, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { userAPI } from "@/lib/api"

export default function ReferAndEarn() {
  const navigate = useNavigate()
  const [referralCode, setReferralCode] = useState("")
  const [stats, setStats] = useState({
    invited: 0,
    completed: 0,
    pending: 0,
    earned: 0
  })
  const [settings, setSettings] = useState({
    minOrderValue: 199,
    referrerReward: 100,
    refereeReward: 50
  })
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const referralLink = `https://dadexpress.com/auth?ref=${referralCode}`

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await userAPI.getReferralStats()
        // Extract data based on standard response structure
        const resData = response?.data?.data || response?.data
        if (resData) {
          setReferralCode(resData.referralCode || "")
          setStats(resData.referralStats || { invited: 0, completed: 0, pending: 0, earned: 0 })
          if (resData.referralSettings) {
            setSettings(resData.referralSettings)
          }
        }
      } catch (err) {
        toast.error("Failed to load referral stats")
        console.error("Error fetching referral stats:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(referralCode)
    setCopied(true)
    toast.success("Referral code copied!")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Dad Express",
          text: `Use my code ${referralCode} to get rewards on Dad Express!`,
          url: referralLink,
        })
      } catch (err) {
        console.log("Error sharing:", err)
      }
    } else {
      navigator.clipboard.writeText(referralLink)
      toast.success("Link copied to clipboard!")
    }
  }

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`Hey! Join Dad Express. Use my code ${referralCode} to earn rewards! ${referralLink}`)
    window.open(`https://wa.me/?text=${text}`, "_blank")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <Loader2 className="h-10 w-10 text-[#E07832] animate-spin" />
      </div>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#FDFDFD] dark:bg-[#0a0a0a] pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#1a1a1a] px-4 py-5 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
          <ArrowLeft className="h-6 w-6 text-black dark:text-white" />
        </button>
        <h1 className="text-xl font-black text-black dark:text-white">Refer & Earn</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 mt-2 space-y-6">
        {/* Banner Section */}
        <div className="bg-gradient-to-r from-[#E07832] to-[#F2994A] rounded-[24px] p-7 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-10">
            <Gift size={140} strokeWidth={1} />
          </div>
          <h2 className="text-[22px] font-black mb-2 relative z-10 leading-tight">Invite Friends & Earn Rewards</h2>
          <p className="text-[13px] font-semibold text-white/90 relative z-10 leading-relaxed max-w-[280px]">
            Share Dad Express with your friends and get {settings.referrerReward} reward coins when they complete their first order.
          </p>
        </div>

        {/* Code Section */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-[24px] p-8 pb-10 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-[11px] font-black mb-4 uppercase tracking-[2px]">Your Referral Code</p>
          <div className="flex items-center justify-center gap-4 border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-2xl p-5 mb-6">
            <span className="text-2xl font-black text-[#E07832] tracking-[3px] ml-6">{referralCode}</span>
            <button
              onClick={handleCopy}
              className="p-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-xl transition-all active:scale-95"
            >
              <Copy className={`h-6 w-6 ${copied ? "text-green-500" : "text-[#E07832]"}`} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center gap-4 mt-2">
            <Button
              onClick={handleWhatsAppShare}
              className="flex-1 bg-[#25D366] hover:bg-[#128C7E] text-white flex items-center justify-center gap-2 h-14 rounded-2xl font-black text-sm shadow-sm transition-all active:scale-95"
            >
              <MessageCircle className="h-5 w-5" />
              WhatsApp
            </Button>
            <Button
              onClick={handleShare}
              variant="outline"
              className="flex-1 border border-gray-100 dark:border-gray-800 flex items-center justify-center gap-2 h-14 rounded-2xl font-black text-sm text-slate-700 dark:text-gray-300 transition-all active:scale-95 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Share2 className="h-5 w-5" />
              Share Link
            </Button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-[24px] p-7 shadow-md shadow-gray-100 dark:shadow-none border border-gray-50 dark:border-gray-800">
          <h3 className="text-lg font-black text-black dark:text-white mb-8">Referral Stats</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            <StatItem icon={Users} color="blue" label="Invited" value={stats.invited} />
            <StatItem icon={CheckCircle} color="green" label="Completed" value={stats.completed} />
            <StatItem icon={Clock} color="orange" label="Pending" value={stats.pending} />
            <StatItem icon={Smartphone} color="theme" label="Earned" value={stats.earned} />
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-6 pt-2">
          <h3 className="text-lg font-black text-black dark:text-white px-2">How it works</h3>
          <div className="space-y-4">
            {[
              { title: "Invite your friends", desc: "Share your referral link or code with friends." },
              { title: "Friend registers", desc: "Your friend signs up using your referral code." },
              { title: "They place first order", desc: `Friend completes their first order of min ₹${settings.minOrderValue}.` },
              { title: "You get rewards!", desc: `${settings.referrerReward} reward coins will be credited to your account.` }
            ].map((step, i) => (
              <div key={i} className="flex gap-4 bg-white dark:bg-[#1a1a1a] p-5 rounded-2xl shadow-sm border border-gray-50 dark:border-gray-800 transition-all hover:border-gray-200">
                <div className="w-9 h-9 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0 font-black text-sm text-gray-400">
                  {i + 1}
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-black text-black dark:text-white text-[14px] leading-none">{step.title}</h4>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 leading-normal">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}

function StatItem({ icon: Icon, color, label, value }) {
  const colors = {
    blue: "bg-blue-50 text-blue-500",
    green: "bg-green-50 text-green-500",
    orange: "bg-orange-50 text-orange-500",
    red: "bg-red-50 text-red-500",
    theme: "bg-orange-50 text-[#E07832]",
  }
  return (
    <div className="text-center space-y-2">
      <div className={`w-12 h-12 ${colors[color]} rounded-full flex items-center justify-center mx-auto mb-1`}>
        <Icon className="h-6 w-6" strokeWidth={2.5} />
      </div>
      <p className="text-xl font-black text-black dark:text-white leading-none">{value}</p>
      <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{label}</p>
    </div>
  )
}
