import { useState, useEffect } from "react"
import { Download, ChevronDown, Filter, Briefcase, RefreshCw, FileText, FileSpreadsheet, Code, Loader2, CheckCircle2, LayoutDashboard, WalletCards, Bike } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { exportReportsToCSV, exportReportsToExcel, exportReportsToPDF, exportReportsToJSON } from "../../components/reports/reportsExportUtils"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { format } from "date-fns"

export default function DeliveryFinanceReport() {
  const [loading, setLoading] = useState(true)
  const [deliveryPartners, setDeliveryPartners] = useState([])
  const [settlements, setSettlements] = useState([])
  const [totals, setTotals] = useState({
    totalOrders: 0,
    totalEarnings: 0,
    totalDistance: 0
  })
  
  const [filters, setFilters] = useState({
    deliveryId: "All Delivery Boys",
    startDate: format(new Date().setDate(new Date().getDate() - 7), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  })

  const parseAmount = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (typeof value === "string") {
      const cleaned = value.replace(/[^\d.-]/g, "")
      const parsed = Number(cleaned)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
  }

  const normalizeSettlement = (settlement) => {
    const earning = settlement?.deliveryPartnerEarning || {}
    return {
      ...settlement,
      deliveryId: settlement?.deliveryPartnerId?._id || settlement?.deliveryPartnerId || null,
      deliveryName: settlement?.deliveryPartnerId?.name || settlement?.deliveryName || "Delivery Boy",
      createdAt: settlement?.createdAt || settlement?.date || settlement?.orderDate || new Date().toISOString(),
      orderNumber: settlement?.orderNumber || settlement?.orderId || settlement?.id || "N/A",
      deliveryEarning: {
        distance: parseAmount(earning.distance),
        basePayout: parseAmount(earning.basePayout),
        surgeAmount: parseAmount(earning.surgeAmount),
        totalEarning: parseAmount(earning.totalEarning),
      },
    }
  }

  // Fetch all delivery partners for the dropdown
  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const response = await adminAPI.getDeliveryPartners({ limit: 1000 })
        if (response?.data?.success && response.data.data?.deliveryPartners) {
          setDeliveryPartners(response.data.data.deliveryPartners)
        }
      } catch (error) {
        console.error("Error fetching delivery partners:", error)
      }
    }
    fetchPartners()
  }, [])

  // Fetch settlement data
  const fetchSettlements = async () => {
    try {
      setLoading(true)
      const hasSelectedPartner = filters.deliveryId !== "All Delivery Boys"
      const params = {
        deliveryId: hasSelectedPartner ? filters.deliveryId : undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }
      
      const response = await adminAPI.getDeliverySettlements(params)
      
      if (response?.data?.success) {
        const payload = response?.data?.data || {}
        const normalizedSettlements = (Array.isArray(payload.settlements) ? payload.settlements : []).map(normalizeSettlement)

        const backendTotals = payload.totals || {}
        const computedTotals = normalizedSettlements.reduce(
          (acc, settlement) => {
            acc.totalOrders += 1
            acc.totalDistance += parseAmount(settlement.deliveryEarning?.distance)
            acc.totalEarnings += parseAmount(settlement.deliveryEarning?.totalEarning)
            return acc;
          },
          { totalOrders: 0, totalEarnings: 0, totalDistance: 0 },
        )

        setSettlements(normalizedSettlements)
        setTotals({
          totalOrders: Number(backendTotals.totalOrders ?? computedTotals.totalOrders) || 0,
          totalEarnings: parseAmount(backendTotals.totalEarnings ?? computedTotals.totalEarnings),
          totalDistance: parseAmount(backendTotals.totalDistance ?? computedTotals.totalDistance),
        })
      } else {
        setSettlements([])
        setTotals({
          totalOrders: 0,
          totalEarnings: 0,
          totalDistance: 0
        })
      }
    } catch (error) {
      console.error("Error fetching settlements:", error)
      toast.error("Failed to fetch settlement data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettlements()
  }, [])

  const handleApplyFilters = () => {
    fetchSettlements()
  }

  const handleMarkAsPaid = async () => {
    if (settlements.length === 0) {
      toast.error("No pending settlements to mark as paid")
      return
    }

    try {
      const settlementIds = settlements.map(s => s._id)
      const response = await adminAPI.markSettlementsProcessed({
        settlementIds,
        actorType: 'admin'
      })

      if (response?.data?.success) {
        toast.success(`Successfully marked ${settlementIds.length} settlements as paid`)
        fetchSettlements() // Refresh data
      } else {
        toast.error(response?.data?.message || "Failed to mark as paid")
      }
    } catch (error) {
      console.error("Error marking settlements as paid:", error)
      toast.error("An error occurred while processing")
    }
  }

  const handleExport = (format) => {
    if (settlements.length === 0) {
      toast.error("No data to export")
      return
    }

    const exportData = settlements.map((s, index) => ({
      sl: index + 1,
      orderNumber: s.orderNumber,
      date: format(new Date(s.createdAt), "dd MMM yyyy HH:mm"),
      deliveryBoy: s.deliveryName,
      distance: s.deliveryEarning?.distance ?? 0,
      basePayout: s.deliveryEarning?.basePayout ?? 0,
      surge: s.deliveryEarning?.surgeAmount ?? 0,
      totalEarning: s.deliveryEarning?.totalEarning ?? 0,
      status: "Delivered"
    }))

    const headers = [
      { key: "sl", label: "SL" },
      { key: "orderNumber", label: "Order #" },
      { key: "date", label: "Date" },
      { key: "deliveryBoy", label: "Delivery Boy" },
      { key: "distance", label: "Distance (km)" },
      { key: "basePayout", label: "Base Payout" },
      { key: "surge", label: "Surge" },
      { key: "totalEarning", label: "Total Earning" },
      { key: "status", label: "Status" },
    ]

    switch (format) {
      case "csv": exportReportsToCSV(exportData, headers, "delivery_finance_report"); break
      case "excel": exportReportsToExcel(exportData, headers, "delivery_finance_report"); break
      case "pdf": exportReportsToPDF(exportData, headers, "delivery_finance_report", "Delivery Finance Report"); break
      case "json": exportReportsToJSON(exportData, "delivery_finance_report"); break
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-600 flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
                <Bike className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Delivery Finance Report</h1>
                <p className="text-sm text-slate-500 font-medium">View and manage delivery boy settlements</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-all text-slate-700">
                    <Download className="w-4 h-4" />
                    Export
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-white shadow-xl border-slate-200">
                  <DropdownMenuLabel>Export Formats</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer hover:bg-slate-50">
                    <FileText className="w-4 h-4 mr-2 text-slate-500" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer hover:bg-slate-50">
                    <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-500" /> Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer hover:bg-slate-50">
                    <FileText className="w-4 h-4 mr-2 text-red-500" /> PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")} className="cursor-pointer hover:bg-slate-50">
                    <Code className="w-4 h-4 mr-2 text-blue-500" /> JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button 
                onClick={handleMarkAsPaid}
                className="flex items-center gap-2 px-6 py-2 text-sm font-bold bg-[#10B981] hover:bg-[#059669] text-white rounded-lg shadow-md transition-all hover:shadow-lg active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark as Paid
              </button>
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                Select Delivery Boy
              </label>
              <div className="relative group">
                <select
                  value={filters.deliveryId}
                  onChange={(e) => setFilters(prev => ({ ...prev, deliveryId: e.target.value }))}
                  className="w-full h-11 pl-4 pr-10 text-sm font-medium rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-slate-800 transition-all cursor-pointer appearance-none"
                >
                  <option value="All Delivery Boys">All Delivery Boys</option>
                  {deliveryPartners.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-colors group-hover:text-slate-600" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">Start Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full h-11 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-800 transition-all cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">End Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full h-11 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-800 transition-all cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={handleApplyFilters}
              className="h-11 px-6 bg-[#1F2937] hover:bg-[#111827] text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all hover:shadow-lg"
            >
              <Filter className="w-4 h-4" />
              Apply Filters
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-blue-500 group-hover:rotate-180 transition-transform duration-500" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">TOTAL ORDERS</p>
            <h3 className="text-4xl font-extrabold text-slate-900 mb-2">{totals.totalOrders}</h3>
            <p className="text-xs font-medium text-slate-500">Total delivered orders</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                <span className="text-rose-500 font-bold text-lg">km</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">TOTAL DISTANCE</p>
            <h3 className="text-4xl font-extrabold text-slate-900 mb-2">{totals.totalDistance.toFixed(2)} km</h3>
            <p className="text-xs font-medium text-slate-500">Total distance covered</p>
          </div>

          <div className="bg-[#0F172A] rounded-2xl shadow-xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <WalletCards className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">TOTAL EARNINGS</p>
            <h3 className="text-4xl font-extrabold text-white mb-2">₹{totals.totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p className="text-xs font-medium text-slate-400">Net payout for delivery boys</p>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Settlement Details</h2>
            <div className="text-[10px] font-bold px-3 py-1 bg-slate-100 text-slate-600 rounded-full">
              {settlements.length} / {settlements.length} records
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC]">
                <tr>
                  {["SL", "Order #", "Date", "Delivery Boy", "Distance", "Base Payout", "Surge", "Total Earning", "Status"].map((header) => (
                    <th key={header} className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 text-slate-800 animate-spin" />
                        <p className="text-sm font-bold text-slate-500">Loading settlement data...</p>
                      </div>
                    </td>
                  </tr>
                ) : settlements.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <LayoutDashboard className="w-10 h-10 text-slate-200" />
                        <p className="text-slate-500 font-bold">No records found for the selected period.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  settlements.map((s, index) => (
                    <tr key={s._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-400">{index + 1}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700 hover:text-blue-600 cursor-pointer">#{s.orderNumber}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">
                            {format(new Date(s.createdAt), "dd MMM yyyy")}
                          </span>
                          <span className="text-[11px] font-medium text-slate-400">
                            {format(new Date(s.createdAt), "HH:mm")}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">{s.deliveryName}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-600">{s.deliveryEarning?.distance ?? 0} km</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">₹{s.deliveryEarning?.basePayout ?? 0}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-orange-500">₹{s.deliveryEarning?.surgeAmount ?? 0}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-blue-600 font-mono">₹{s.deliveryEarning?.totalEarning ?? 0}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 uppercase border border-emerald-100">
                          Delivered
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
