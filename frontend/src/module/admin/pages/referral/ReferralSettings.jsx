import { useState, useEffect } from "react";
import { Save, Gift, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api, { API_ENDPOINTS } from "@/lib/api";

export default function ReferralSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    isEnabled: true,
    referrerReward: 100,
    refereeReward: 50,
    minOrderValue: 199,
    rewardExpiryDays: 30,
    maxRedemptionPercentage: 20
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get(API_ENDPOINTS.REFERRAL.SETTINGS);
      if (res.data?.success && res.data.data?.referral) {
        setSettings(res.data.data.referral);
      }
    } catch (error) {
      console.error("Failed to fetch referral settings", error);
      toast.error("Failed to load referral settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        referral: {
          isEnabled: settings.isEnabled,
          referrerReward: Number(settings.referrerReward),
          refereeReward: Number(settings.refereeReward),
          minOrderValue: Number(settings.minOrderValue),
          rewardExpiryDays: Number(settings.rewardExpiryDays),
          maxRedemptionPercentage: Number(settings.maxRedemptionPercentage)
        }
      };
      const res = await api.put(API_ENDPOINTS.REFERRAL.SETTINGS, payload);
      if (res.data?.success) {
        toast.success("Referral settings updated successfully!");
        if (res.data.data?.referral) {
          setSettings(res.data.data.referral);
        }
      }
    } catch (error) {
      console.error("Failed to update referral settings", error);
      toast.error(error.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#F8FAFC] min-h-screen font-sans">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Gift className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Referral Settings</h2>
              <p className="text-[12px] text-slate-500 font-medium">Configure how your referral system works</p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#2563EB] hover:bg-blue-700 text-white px-4 h-9 rounded-lg font-bold flex items-center gap-2 text-sm transition-all active:scale-95 disabled:opacity-70"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </Button>
        </div>

        <div className="space-y-4">
          {/* Toggle Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-md font-bold text-slate-800">Enable Referral System</h3>
                <p className="text-[12px] text-slate-400 font-medium">Turn the entire referral system ON or OFF for all users</p>
              </div>
              <Switch
                checked={settings.isEnabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, isEnabled: checked }))}
                className="data-[state=checked]:bg-blue-600 h-6 w-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reward Amounts Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                <Gift className="w-4 h-4 text-blue-600" />
                Reward Amounts
              </h3>

              <div className="space-y-1.5">
                <Label className="text-[12px] font-bold text-slate-700">Referrer Reward (Coins)</Label>
                <Input
                  type="number"
                  name="referrerReward"
                  value={settings.referrerReward}
                  onChange={handleChange}
                  className="h-10 border-slate-200 rounded-lg focus-visible:ring-blue-600 text-md font-medium px-3"
                />
                <p className="text-[10px] text-slate-400 font-medium">Coins given to the user who refers a friend</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[12px] font-bold text-slate-700">Referee Reward (Coins)</Label>
                <Input
                  type="number"
                  name="refereeReward"
                  value={settings.refereeReward}
                  onChange={handleChange}
                  className="h-10 border-slate-200 rounded-lg focus-visible:ring-blue-600 text-md font-medium px-3"
                />
                <p className="text-[10px] text-slate-400 font-medium">Coins given to the new user who joins via link</p>
              </div>
            </div>

            {/* Limits & Expiry Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600" />
                Limits & Expiry
              </h3>

              <div className="space-y-1.5">
                <Label className="text-[12px] font-bold text-slate-700">Min. Order Value (₹)</Label>
                <Input
                  type="number"
                  name="minOrderValue"
                  value={settings.minOrderValue}
                  onChange={handleChange}
                  className="h-10 border-slate-200 rounded-lg focus-visible:ring-blue-600 text-md font-medium px-3"
                />
                <p className="text-[10px] text-slate-400 font-medium">Reward triggers only if friend's first order is above this.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[12px] font-bold text-slate-700">Reward Expiry (Days)</Label>
                <Input
                  type="number"
                  name="rewardExpiryDays"
                  value={settings.rewardExpiryDays}
                  onChange={handleChange}
                  className="h-10 border-slate-200 rounded-lg focus-visible:ring-blue-600 text-md font-medium px-3"
                />
                <p className="text-[10px] text-slate-400 font-medium">Coins will expire after these many days</p>
              </div>
            </div>

            {/* Checkout Redemption Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm md:col-span-2 space-y-4">
              <h3 className="text-md font-bold text-slate-800">Checkout Redemption</h3>
              <div className="flex flex-col md:flex-row items-center gap-5">
                <div className="w-full md:w-1/4 space-y-1.5">
                  <Label className="text-[11px] font-bold text-slate-700 uppercase">Max. Redemption Cap (%)</Label>
                  <Input
                    type="number"
                    name="maxRedemptionPercentage"
                    value={settings.maxRedemptionPercentage}
                    onChange={handleChange}
                    className="h-10 border-slate-200 rounded-lg focus-visible:ring-blue-600 text-md font-medium px-3"
                  />
                </div>
                <div className="flex-1 bg-amber-50/50 border border-amber-100 p-3 rounded-lg flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-800 font-semibold leading-normal">
                    Higher percentage might increase conversion but could slightly affect profit margins per order.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
