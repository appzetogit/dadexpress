import { useState } from "react"
import { IndianRupee, Loader2 } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"

export default function DepositPopup({ onSuccess, cashInHand = 0 }) {
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  const cashInHandNum = Number(cashInHand) || 0

  const handleAmountChange = (e) => {
    const v = e.target.value.replace(/[^0-9.]/g, "")
    if (v === "" || (parseFloat(v) >= 0 && parseFloat(v) <= 500000)) setAmount(v)
  }

  const handleDeposit = async () => {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt < 1) {
      toast.error("Enter a valid amount (minimum ₹1)")
      return
    }
    if (amt > 500000) {
      toast.error("Maximum deposit is ₹5,00,000")
      return
    }
    if (cashInHandNum > 0 && amt > cashInHandNum) {
      toast.error(`Deposit amount cannot exceed cash in hand (₹${cashInHandNum.toFixed(2)})`)
      return
    }

    try {
      setLoading(true)
      const orderRes = await deliveryAPI.createDepositOrder(amt)
      const data = orderRes?.data?.data
      const rp = data?.razorpay
      if (!rp?.orderId || !rp?.key) {
        toast.error("Payment gateway not ready. Please try again.")
        setLoading(false)
        return
      }
      setLoading(false)

      let profile = {}
      try {
        const pr = await deliveryAPI.getProfile()
        profile = pr?.data?.data?.profile || pr?.data?.profile || {}
      } catch (_) {}

      const phone = (profile?.phone || "").replace(/\D/g, "").slice(-10)
      const email = profile?.email || ""
      const name = profile?.name || ""

      const companyName = await getCompanyNameAsync()
      setProcessing(true)
      const isAPKContext = () => {
        try {
          if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
          const userAgent = navigator.userAgent || '';
          const isWebView = /wv|WebView/i.test(userAgent);
          const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
          const isIOSStandalone = window.navigator.standalone === true;
          const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
          const hasNativeBridge = typeof window.flutter_inappwebview !== 'undefined' || typeof window.Android !== 'undefined';
          return isWebView || isStandalone || isIOSStandalone || (isMobileDevice && hasNativeBridge) || (window.self !== window.top);
        } catch (e) { return false; }
      };

      const isInIframe = () => {
        try { return window.self !== window.top; } catch (e) { return true; }
      };

      const isAPK = isAPKContext();
      const inIframe = isInIframe();

      await initRazorpayPayment({
        key: rp.key,
        amount: rp.amount,
        currency: rp.currency || "INR",
        order_id: rp.orderId,
        name: companyName,
        description: `Cash limit deposit - ₹${amt.toFixed(2)}`,
        prefill: {
          name: name,
          email: email,
          contact: phone
        },
        notes: {
          orderId: rp.orderId,
          type: "cash_deposit",
          amount: amt.toString()
        },
        webview_intent: true,
        config: isAPK || inIframe ? undefined : {
          display: {
            blocks: {
              upi: {
                name: "UPI",
                instruments: [
                  {
                    method: "upi",
                    flows: ["qr", "intent"],
                  },
                ],
              },
              banks: {
                name: "Other Payment Methods",
                instruments: [
                  {
                    method: "upi",
                    flows: ["collect"],
                  },
                  {
                    method: "card",
                  },
                  {
                    method: "netbanking",
                  },
                  {
                    method: "wallet",
                  },
                ],
              },
            },
            sequence: ["block.upi", "block.banks"],
            preferences: {
              show_default_blocks: false,
            },
          },
        },
        handler: async (res) => {
          try {
            let final_order_id = res?.razorpay_order_id || res?.orderId || res?.order_id || rp.orderId;
            let final_payment_id = res?.razorpay_payment_id || res?.paymentId || res?.payment_id;
            let final_signature = res?.razorpay_signature || res?.signature;

            if (typeof res === 'string' && res.includes('?')) {
              try {
                const urlParams = Object.fromEntries(new URL(res).searchParams);
                final_order_id = final_order_id || urlParams.razorpay_order_id || urlParams.orderId;
                final_payment_id = final_payment_id || urlParams.razorpay_payment_id || urlParams.paymentId;
                final_signature = final_signature || urlParams.razorpay_signature || urlParams.signature;
              } catch (e) {}
            }

            const verifyRes = await deliveryAPI.verifyDepositPayment({
              razorpay_order_id: final_order_id,
              razorpay_payment_id: final_payment_id,
              razorpay_signature: final_signature,
              amount: amt
            })
            if (verifyRes?.data?.success) {
              toast.success(`Deposit of ₹${amt.toFixed(2)} successful. Available limit updated.`)
              setAmount("")
              window.dispatchEvent(new CustomEvent("deliveryWalletStateUpdated"))
              if (onSuccess) onSuccess()
            } else {
              toast.error(verifyRes?.data?.message || "Verification failed")
            }
          } catch (err) {
            toast.error(err?.response?.data?.message || "Verification failed. Contact support.")
          } finally {
            setProcessing(false)
          }
        },
        onError: (e) => {
          toast.error(e?.description || "Payment failed")
          setProcessing(false)
        },
        onClose: () => setProcessing(false)
      })
    } catch (err) {
      setLoading(false)
      setProcessing(false)
      toast.error(err?.response?.data?.message || "Failed to create payment")
    }
  }

  return (
    <div className="flex flex-col p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Amount (₹)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <IndianRupee className="w-4 h-4" />
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={handleAmountChange}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        {cashInHandNum > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            Cash in hand: ₹{cashInHandNum.toFixed(2)}. Deposit cannot exceed this.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDeposit}
        disabled={loading || processing || !amount || parseFloat(amount) < 1}
        className="w-full py-2.5 rounded-lg bg-black text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading || processing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : null}
        {loading ? "Creating…" : processing ? "Complete payment…" : "Deposit"}
      </button>
    </div>
  )
}
