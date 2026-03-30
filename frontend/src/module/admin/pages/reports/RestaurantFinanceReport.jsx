import { useState, useEffect } from "react"
import { Download, ChevronDown, Filter, Briefcase, RefreshCw, FileText, FileSpreadsheet, Code, Loader2, CheckCircle2, LayoutDashboard, WalletCards } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { exportReportsToCSV, exportReportsToExcel, exportReportsToPDF, exportReportsToJSON } from "../../components/reports/reportsExportUtils"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { format } from "date-fns"

export default function RestaurantFinanceReport() {
  const [loading, setLoading] = useState(true)
  const [restaurants, setRestaurants] = useState([])
  const [settlements, setSettlements] = useState([])
  const [paidHistory, setPaidHistory] = useState([])
  const [totals, setTotals] = useState({
    totalOrders: 0,
    totalEarnings: 0,
    totalCommission: 0
  })
  
  const [filters, setFilters] = useState({
    restaurantId: "All Restaurants",
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
    const earning = settlement?.restaurantEarning || {}
    const metadata = settlement?.metadata || {}
    const readMetaValue = (key) => {
      if (!metadata) return null
      if (typeof metadata.get === "function") return metadata.get(key) ?? null
      return metadata[key] ?? null
    }

    return {
      ...settlement,
      restaurantId: settlement?.restaurantId?._id || settlement?.restaurantId || settlement?.restaurant?._id || null,
      restaurantName:
        settlement?.restaurantId?.name ||
        settlement?.restaurantName ||
        settlement?.restaurant?.name ||
        "Restaurant",
      createdAt: settlement?.createdAt || settlement?.date || settlement?.orderDate || new Date().toISOString(),
      orderNumber: settlement?.orderNumber || settlement?.orderId || settlement?.id || "N/A",
      restaurantEarning: {
        foodPrice: parseAmount(earning.foodPrice ?? settlement?.foodPrice),
        commission: parseAmount(earning.commission ?? settlement?.commission),
        netEarning: parseAmount(earning.netEarning ?? settlement?.netEarning ?? settlement?.originalPrice),
      },
      paidAt: readMetaValue("restaurantFinanceReportMarkedAt") || settlement?.updatedAt || null,
      paidByType: readMetaValue("restaurantFinanceReportMarkedByType") || null,
      isMarkedAsPaid: readMetaValue("restaurantFinanceReportMarked") === true,
    }
  }

  // Fetch all restaurants for the dropdown
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const response = await adminAPI.getRestaurants({ limit: 1000 })
        if (response?.data?.success && response.data.data?.restaurants) {
          setRestaurants(response.data.data.restaurants)
        }
      } catch (error) {
        console.error("Error fetching restaurants:", error)
      }
    }
    fetchRestaurants()
  }, [])

  // Fetch settlement data
  const fetchSettlements = async () => {
    try {
      setLoading(true)
      const hasSelectedRestaurant = filters.restaurantId !== "All Restaurants"
      const params = {
        restaurantId: hasSelectedRestaurant ? filters.restaurantId : undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }
      
      const [pendingResponse, historyResponse] = await Promise.all([
        adminAPI.getRestaurantSettlements(params),
        adminAPI.getRestaurantSettlements({ ...params, view: "history" }),
      ])

      const pendingPayload = pendingResponse?.data?.data || {}
      const historyPayload = historyResponse?.data?.data || {}
      const normalizedSettlements = (Array.isArray(pendingPayload.settlements) ? pendingPayload.settlements : []).map(normalizeSettlement)
      const normalizedPaidHistory = (Array.isArray(historyPayload.settlements) ? historyPayload.settlements : []).map(normalizeSettlement)

      const backendTotals = pendingPayload.totals || {}
      const computedTotals = normalizedSettlements.reduce(
        (acc, settlement) => {
          acc.totalOrders += 1
          acc.totalCommission += parseAmount(settlement.restaurantEarning?.commission)
          acc.totalEarnings += parseAmount(settlement.restaurantEarning?.netEarning)
          return acc
        },
        { totalOrders: 0, totalEarnings: 0, totalCommission: 0 },
      )

      setSettlements(normalizedSettlements)
      setPaidHistory(normalizedPaidHistory)
      setTotals({
        totalOrders: Number(backendTotals.totalOrders ?? computedTotals.totalOrders) || 0,
        totalEarnings: parseAmount(backendTotals.totalEarnings ?? computedTotals.totalEarnings),
        totalCommission: parseAmount(backendTotals.totalCommission ?? computedTotals.totalCommission),
      })
    } catch (error) {
      console.error("Error fetching settlements:", error)
      toast.error("Failed to fetch settlement data")
      setSettlements([])
      setPaidHistory([])
      setTotals({
        totalOrders: 0,
        totalEarnings: 0,
        totalCommission: 0
      })
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
      restaurant: s.restaurantName,
      foodPrice: s.restaurantEarning?.foodPrice ?? 0,
      commission: s.restaurantEarning?.commission ?? 0,
      netEarning: s.restaurantEarning?.netEarning ?? 0,
      status: "Delivered"
    }))

    const headers = [
      { key: "sl", label: "SL" },
      { key: "orderNumber", label: "Order #" },
      { key: "date", label: "Date" },
      { key: "restaurant", label: "Restaurant" },
      { key: "foodPrice", label: "Food Price" },
      { key: "commission", label: "Commission" },
      { key: "netEarning", label: "Original Price" },
      { key: "status", label: "Status" },
    ]

    switch (format) {
      case "csv": exportReportsToCSV(exportData, headers, "restaurant_finance_report"); break
      case "excel": exportReportsToExcel(exportData, headers, "restaurant_finance_report"); break
      case "pdf": exportReportsToPDF(exportData, headers, "restaurant_finance_report", "Restaurant Finance Report"); break
      case "json": exportReportsToJSON(exportData, "restaurant_finance_report"); break
    }
  }

  const formatCurrency = (value) => {
    const amount = parseAmount(value)
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatDateTime = (value, formatString = "dd MMM yyyy HH:mm") => {
    if (!value) return "N/A"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "N/A"
    return format(date, formatString)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Restaurant Finance Report</h1>
                <p className="text-sm text-slate-500 font-medium">View and manage restaurant settlements</p>
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
                Select Restaurant
              </label>
              <div className="relative group">
                <select
                  value={filters.restaurantId}
                  onChange={(e) => setFilters(prev => ({ ...prev, restaurantId: e.target.value }))}
                  className="w-full h-11 pl-4 pr-10 text-sm font-medium rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-slate-800 transition-all cursor-pointer appearance-none"
                >
                  <option value="All Restaurants">All Restaurants</option>
                  {restaurants.map(r => (
                    <option key={r._id} value={r._id}>{r.name}</option>
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
                <span className="text-rose-500 font-bold text-xs">INR</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">TOTAL COMMISSION</p>
            <h3 className="text-4xl font-extrabold text-slate-900 mb-2">{formatCurrency(totals.totalCommission)}</h3>
            <p className="text-xs font-medium text-slate-500">Admin commission shared</p>
          </div>

          <div className="bg-[#0F172A] rounded-2xl shadow-xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <WalletCards className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">ORIGINAL PRICE (NET)</p>
            <h3 className="text-4xl font-extrabold text-white mb-2">{formatCurrency(totals.totalEarnings)}</h3>
            <p className="text-xs font-medium text-slate-400">Net amount for restaurants</p>
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
                  {["SL", "Order #", "Date", "Restaurant", "Food Price", "Commission", "Original Price", "Status"].map((header) => (
                    <th key={header} className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 text-slate-800 animate-spin" />
                        <p className="text-sm font-bold text-slate-500">Loading settlement data...</p>
                      </div>
                    </td>
                  </tr>
                ) : settlements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-20 text-center">
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
                        <span className="text-sm font-bold text-slate-700">{s.restaurantName}</span>
                      </td>
                      <td className="px-6 py-4 text-right pr-12">
                        <span className="text-sm font-bold text-slate-700 pr-10">{formatCurrency(s.restaurantEarning?.foodPrice ?? 0)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-rose-500">{formatCurrency(s.restaurantEarning?.commission ?? 0)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-blue-600 font-mono">{formatCurrency(s.restaurantEarning?.netEarning ?? 0)}</span>
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

        {/* Marked as Paid History Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-emerald-50/40 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Marked as Paid History</h2>
            <div className="text-[10px] font-bold px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full">
              {paidHistory.length} records
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC]">
                <tr>
                  {["SL", "Order #", "Date", "Restaurant", "Food Price", "Commission", "Original Price", "Paid On", "Status"].map((header) => (
                    <th key={header} className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-7 h-7 text-slate-800 animate-spin" />
                        <p className="text-sm font-bold text-slate-500">Loading paid history...</p>
                      </div>
                    </td>
                  </tr>
                ) : paidHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <p className="text-slate-500 font-bold">No marked-as-paid history found for the selected period.</p>
                    </td>
                  </tr>
                ) : (
                  paidHistory.map((s, index) => (
                    <tr key={s._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-400">{index + 1}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">#{s.orderNumber}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{formatDateTime(s.createdAt, "dd MMM yyyy")}</span>
                          <span className="text-[11px] font-medium text-slate-400">{formatDateTime(s.createdAt, "HH:mm")}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">{s.restaurantName}</span>
                      </td>
                      <td className="px-6 py-4 text-right pr-12">
                        <span className="text-sm font-bold text-slate-700 pr-10">{formatCurrency(s.restaurantEarning?.foodPrice ?? 0)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-rose-500">{formatCurrency(s.restaurantEarning?.commission ?? 0)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-blue-600 font-mono">{formatCurrency(s.restaurantEarning?.netEarning ?? 0)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-700">{formatDateTime(s.paidAt)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 uppercase border border-emerald-100">
                          Paid
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
