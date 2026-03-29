import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { Loader2, Search, User, Phone, MapPin, Bike } from "lucide-react"

export default function ManualAssignmentDialog({ isOpen, onOpenChange, order, onAssigned }) {
  const [loading, setLoading] = useState(false)
  const [riders, setRiders] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [fetchingRiders, setFetchingRiders] = useState(false)
  const [selectedRiderId, setSelectedRiderId] = useState(null)

  const formatPhone = (phone) => {
    if (!phone) return "";
    let cleaned = phone.toString().trim();
    if (cleaned.startsWith("+91")) return cleaned.slice(3).trim();
    if (cleaned.startsWith("91") && cleaned.length > 10) return cleaned.slice(2).trim();
    return cleaned.replace(/[-\s]/g, "");
  };

  useEffect(() => {
    if (isOpen) {
      fetchAvailableRiders()
    } else {
      setSearchTerm("")
      setSelectedRiderId(null)
    }
  }, [isOpen])

  const fetchAvailableRiders = async () => {
    try {
      setFetchingRiders(true)
      // Fetch online delivery partners
      const response = await adminAPI.getDeliveryPartners({
        isActive: true,
        includeAvailability: true,
        limit: 100 // Get a good number of riders
      })

      if (response?.data?.success) {
        setRiders(response.data.data.deliveryPartners || [])
      }
    } catch (error) {
      console.error("Error fetching riders:", error)
      toast.error("Failed to fetch available riders")
    } finally {
      setFetchingRiders(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedRiderId) {
      toast.error("Please select a rider first")
      return
    }

    try {
      setLoading(true)
      const response = await adminAPI.assignDeliveryPartner(order.id || order._id, selectedRiderId)

      if (response?.data?.success) {
        toast.success("Rider assigned successfully")
        onAssigned && onAssigned()
        onOpenChange(false)
      } else {
        toast.error(response?.data?.message || "Failed to assign rider")
      }
    } catch (error) {
      console.error("Error assigning rider:", error)
      toast.error(error.response?.data?.message || "Failed to assign rider")
    } finally {
      setLoading(false)
    }
  }

  const filteredRiders = riders.filter(rider => 
    rider.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rider.phone?.includes(searchTerm) ||
    rider.deliveryId?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Bike className="w-5 h-5 text-blue-600" />
            Assign Delivery Partner
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Assign or replace a rider for Order #{order?.orderId || order?.id}
          </p>
        </DialogHeader>

        <div className="p-6 pt-4 flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name, phone or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 border-slate-200 focus:ring-blue-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {fetchingRiders ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <p className="text-sm text-slate-500">Fetching online riders...</p>
              </div>
            ) : filteredRiders.length > 0 ? (
              <div className="grid gap-2">
                {filteredRiders.map((rider) => (
                  <div
                    key={rider._id}
                    onClick={() => setSelectedRiderId(rider._id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 ${
                      selectedRiderId === rider._id
                        ? "bg-blue-50 border-blue-200 shadow-sm"
                        : "bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                      rider.status === 'Online' ? 'bg-emerald-100' : 'bg-slate-100'
                    }`}>
                      {rider.profileImage ? (
                        <img src={rider.profileImage} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <User className={`w-6 h-6 ${rider.status === 'Online' ? 'text-emerald-600' : 'text-slate-400'}`} />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold text-slate-900 truncate">{rider.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          rider.status === 'Online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {rider.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {formatPhone(rider.phone)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {rider.zone?.split(',')[0] || 'Unknown'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                       <span className="text-[10px] font-bold text-slate-400">{rider.deliveryId}</span>
                       <div className="flex items-center gap-1">
                         <span className="text-xs font-bold text-orange-500">★ {rider.rating?.toFixed(1) || '0.0'}</span>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                <Bike className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-sm font-medium text-slate-600">No riders found</p>
                <p className="text-xs text-slate-400">Try searching with a different term or ensure riders are online</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 flex sm:justify-between items-center">
          <div className="hidden sm:block">
            {selectedRiderId && (
              <span className="text-sm text-slate-600">
                Selected: <span className="font-bold text-slate-900">{riders.find(r => r._id === selectedRiderId)?.name}</span>
              </span>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={loading || !selectedRiderId}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign Rider"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
