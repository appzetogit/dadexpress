import { useEffect, useState } from "react"
import { Download, ChevronDown, RefreshCw, FileText, DollarSign, Settings, FileSpreadsheet, Code } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { exportReportsToCSV, exportReportsToExcel, exportReportsToPDF, exportReportsToJSON } from "../../components/reports/reportsExportUtils"

export default function TaxReport() {
  const [filters, setFilters] = useState({
    dateRangeType: "Select Date Range",
    calculateTax: "Select Calculate Tax",
    taxRate: "Select Tax Rate",
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [reportRows, setReportRows] = useState([])
  const [summaryStats, setSummaryStats] = useState({
    totalIncome: 0,
    totalTax: 0,
  })

  const formatCurrency = (value) => {
    const amount = Number(value || 0)
    return `₹${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const parseTaxRate = (taxRateValue) => {
    if (!taxRateValue || taxRateValue === "Select Tax Rate") return null
    const parsed = Number(String(taxRateValue).replace("%", "").trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  const calculateTaxForRow = ({ income, backendTax, calculateTax, taxRate }) => {
    const safeIncome = Number(income || 0)
    const safeBackendTax = Number(backendTax || 0)

    // Default and safest behavior: use backend-calculated GST from order pricing.
    if (!calculateTax || calculateTax === "Select Calculate Tax") {
      return safeBackendTax
    }

    if (calculateTax === "Percentage") {
      const parsedRate = parseTaxRate(taxRate)
      if (parsedRate === null) return safeBackendTax
      return (safeIncome * parsedRate) / 100
    }

    // For Fixed Amount / Tiered, keep backend GST to avoid changing existing tax logic.
    return safeBackendTax
  }

  const getDateRangeFromType = (dateRangeType) => {
    const now = new Date()
    const toDate = new Date(now)
    let fromDate = null

    switch (dateRangeType) {
      case "Today": {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      }
      case "This Week": {
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1)
        fromDate = new Date(now.getFullYear(), now.getMonth(), diff)
        break
      }
      case "This Month": {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      }
      case "This Year": {
        fromDate = new Date(now.getFullYear(), 0, 1)
        break
      }
      default:
        return {}
    }

    const toISODate = (date) => date.toISOString().split("T")[0]
    return {
      fromDate: fromDate ? toISODate(fromDate) : undefined,
      toDate: toISODate(toDate),
    }
  }

  const fetchTaxReport = async (activeFilters = filters) => {
    try {
      const params = getDateRangeFromType(activeFilters.dateRangeType)
      const response = await adminAPI.getTransactionReport(params)
      const transactions = response?.data?.data?.transactions || []

      const mappedRows = transactions.map((txn, index) => {
        const totalIncome = Number(txn.orderAmount || 0)
        const totalTax = calculateTaxForRow({
          income: totalIncome,
          backendTax: txn.vatTax || 0,
          calculateTax: activeFilters.calculateTax,
          taxRate: activeFilters.taxRate,
        })

        return {
          sl: index + 1,
          incomeSource: txn.orderId || "N/A",
          totalIncome: formatCurrency(totalIncome),
          totalTax: formatCurrency(totalTax),
        }
      })

      const totalIncome = transactions.reduce(
        (sum, txn) => sum + Number(txn.orderAmount || 0),
        0,
      )
      const totalTax = transactions.reduce(
        (sum, txn) =>
          sum +
          calculateTaxForRow({
            income: Number(txn.orderAmount || 0),
            backendTax: txn.vatTax || 0,
            calculateTax: activeFilters.calculateTax,
            taxRate: activeFilters.taxRate,
          }),
        0,
      )

      setReportRows(mappedRows)
      setSummaryStats({
        totalIncome,
        totalTax,
      })
    } catch (error) {
      console.error("Failed to fetch tax report:", error)
      setReportRows([])
      setSummaryStats({
        totalIncome: 0,
        totalTax: 0,
      })
    }
  }

  useEffect(() => {
    fetchTaxReport(filters)
  }, [])

  const handleReset = () => {
    const resetFilters = {
      dateRangeType: "Select Date Range",
      calculateTax: "Select Calculate Tax",
      taxRate: "Select Tax Rate",
    }
    setFilters(resetFilters)
    fetchTaxReport(resetFilters)
  }

  const handleSubmit = () => {
    fetchTaxReport(filters)
  }

  const handleExport = (format) => {
    if (reportRows.length === 0) {
      alert("No data to export")
      return
    }
    const headers = [
      { key: "sl", label: "SI" },
      { key: "incomeSource", label: "Income Source" },
      { key: "totalIncome", label: "Total Income" },
      { key: "totalTax", label: "Total Tax" },
    ]
    switch (format) {
      case "csv": exportReportsToCSV(reportRows, headers, "tax_report"); break
      case "excel": exportReportsToExcel(reportRows, headers, "tax_report"); break
      case "pdf": exportReportsToPDF(reportRows, headers, "tax_report", "Tax Report"); break
      case "json": exportReportsToJSON(reportRows, "tax_report"); break
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen overflow-x-hidden">
      <div className="w-full max-w-full">
        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Generate Tax Report</h1>
        </div>

        {/* Admin Tax Report Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Admin Tax Report</h2>
          <p className="text-sm text-slate-600 mb-6">
            To generate you tax report please select & input following field and submit for the result.
          </p>

          <div className="space-y-4 mb-6">
            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Date Range Type
              </label>
              <select
                value={filters.dateRangeType}
                onChange={(e) => setFilters(prev => ({ ...prev, dateRangeType: e.target.value }))}
                className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Select Date Range">Select Date Range</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
                <option value="This Year">This Year</option>
                <option value="Custom Range">Custom Range</option>
              </select>
              <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Select How to calculate tax
              </label>
              <select
                value={filters.calculateTax}
                onChange={(e) => setFilters(prev => ({ ...prev, calculateTax: e.target.value }))}
                className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Select Calculate Tax">Select Calculate Tax</option>
                <option value="Percentage">Percentage</option>
                <option value="Fixed Amount">Fixed Amount</option>
                <option value="Tiered">Tiered</option>
              </select>
              <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Select Tax Rates
              </label>
              <select
                value={filters.taxRate}
                onChange={(e) => setFilters(prev => ({ ...prev, taxRate: e.target.value }))}
                className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Select Tax Rate">Select Tax Rate</option>
                <option value="5%">5%</option>
                <option value="10%">10%</option>
                <option value="15%">15%</option>
                <option value="20%">20%</option>
              </select>
              <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleReset}
              className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
            >
              Reset
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-all"
            >
              Submit
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Total Income Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Income</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(summaryStats.totalIncome)}</p>
              </div>
              <div className="w-14 h-14 rounded-lg bg-yellow-100 flex items-center justify-center">
                <DollarSign className="w-8 h-8 text-yellow-600" />
              </div>
            </div>
          </div>

          {/* Total Tax Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Tax</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(summaryStats.totalTax)}</p>
              </div>
              <div className="w-14 h-14 rounded-lg bg-pink-100 flex items-center justify-center">
                <FileText className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tax Report List Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-slate-900">Tax Report List</h2>

            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all">
                    <Download className="w-4 h-4" />
                    <span className="text-black font-bold">Export</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")} className="cursor-pointer">
                    <Code className="w-4 h-4 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Table */}
          {reportRows.length === 0 ? (
            <div className="py-20 text-center">
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
                  <FileText className="w-12 h-12 text-purple-600" />
                </div>
                <p className="text-lg font-semibold text-slate-700 mb-2">No Tax Report Generated</p>
                <p className="text-sm text-slate-500 max-w-md">
                  To generate your tax report please select & input above field and submit for the result
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      SI
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Income Source
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Total Income
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Total Tax
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {reportRows.map((report) => (
                    <tr key={report.sl} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{report.sl}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{report.incomeSource}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">{report.totalIncome}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">{report.totalTax}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Report Settings
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-700">
              Tax report settings and preferences will be available here.
            </p>
          </div>
          <div className="px-6 pb-6 flex items-center justify-end">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
