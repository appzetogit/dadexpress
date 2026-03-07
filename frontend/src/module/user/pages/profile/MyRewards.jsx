import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Gift, History, TrendingUp, Info, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { userAPI } from "@/lib/api"
import { toast } from "sonner"

export default function MyRewards() {
  const navigate = useNavigate()
  const [balance, setBalance] = useState(0)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWalletData = async () => {
      try {
        const response = await userAPI.getWallet()
        const walletData = response.data?.data?.wallet || response.data?.wallet
        if (walletData) {
          setBalance(walletData.balance || 0)
          setHistory(walletData.transactions || [])
        }
      } catch (error) {
        console.error("Error fetching wallet data:", error)
        toast.error("Failed to load rewards data")
      } finally {
        setLoading(false)
      }
    }

    fetchWalletData()
  }, [])

  const handleRedeemClick = () => {
    toast.info("How to Redeem", {
      description: "Your reward coins are automatically applied at checkout for discounts on your orders!",
      duration: 5000,
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <Loader2 className="h-10 w-10 text-[#E07832] animate-spin" />
      </div>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#1a1a1a] px-4 py-5 flex items-center gap-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
          <ArrowLeft className="h-6 w-6 text-black dark:text-white" />
        </button>
        <h1 className="text-xl font-bold text-black dark:text-white">My Rewards</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 mt-2">
        {/* Balance Card */}
        <div className="bg-gradient-to-r from-[#E07832] to-[#F2994A] rounded-[24px] p-8 text-white shadow-lg relative overflow-hidden mb-6">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-4 opacity-10">
            <Gift size={140} strokeWidth={1} />
          </div>
          <p className="text-white/80 text-[11px] font-bold uppercase tracking-[1px] mb-1">TOTAL BALANCE</p>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-5xl font-black tracking-tight">{balance}</span>
            <span className="text-xl font-bold mt-2 opacity-90">Coins</span>
          </div>

          <div className="flex items-center gap-2 bg-black/10 w-fit px-3 py-1.5 rounded-full border border-white/5">
            <Info size={14} className="text-white/80" />
            <p className="text-[10px] text-white/95 font-medium">Expires in 30 days</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-10 relative z-[20]">
          <button
            type="button"
            className="group w-full bg-white dark:bg-[#1a1a1a] p-6 rounded-[24px] border border-slate-100 dark:border-gray-800 flex flex-col items-center justify-center gap-3 cursor-pointer shadow-sm active:scale-95 transition-all hover:border-[#E07832] hover:bg-orange-50/20 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#E07832]"
            onClick={() => navigate('/user/profile/refer')}
          >
            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-2xl flex items-center justify-center group-hover:bg-[#E07832] transition-colors">
              <TrendingUp size={24} className="text-[#E07832] group-hover:text-white transition-colors" strokeWidth={2.5} />
            </div>
            <span className="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-wider">Refer & Earn</span>
          </button>

          <button
            type="button"
            className="group w-full bg-white dark:bg-[#1a1a1a] p-6 rounded-[24px] border border-slate-100 dark:border-gray-800 flex flex-col items-center justify-center gap-3 cursor-pointer shadow-sm active:scale-95 transition-all hover:border-[#E07832] hover:bg-orange-50/20 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#E07832]"
            onClick={handleRedeemClick}
          >
            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-2xl flex items-center justify-center group-hover:bg-[#E07832] transition-colors">
              <Gift size={24} className="text-[#E07832] group-hover:text-white transition-colors" strokeWidth={2.5} />
            </div>
            <span className="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-wider">Redeem</span>
          </button>
        </div>

        {/* History Section */}
        <div className="space-y-5">
          <div className="flex items-center gap-2 px-1">
            <History size={18} className="text-slate-400" />
            <h3 className="text-[15px] font-bold text-black dark:text-white">Reward History</h3>
          </div>

          <div className="bg-white dark:bg-[#1a1a1a] rounded-[24px] border border-slate-50 dark:border-gray-800 overflow-hidden shadow-sm">
            {history.length > 0 ? (
              <div className="divide-y divide-slate-50 dark:divide-gray-800">
                {history.map((item) => (
                  <div key={item.id || item._id} className="p-5 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-bold text-[14px] text-black dark:text-white leading-none">{item.description}</p>
                      <p className="text-[11px] font-medium text-slate-400">
                        {new Date(item.date || item.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className={`text-[14px] font-bold ${item.type === 'addition' || item.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                      {item.type === 'addition' || item.type === 'credit' ? `+${item.amount}` : `-${item.amount}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-10 text-center">
                <History size={40} className="mx-auto text-slate-200 mb-3" />
                <p className="text-slate-400 text-sm font-medium">No reward history yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}

