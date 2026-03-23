import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, ArrowUpRight, ShoppingBag, CreditCard, Truck, Receipt, DollarSign, Store, UserCheck, Package, UserCircle, Clock, CheckCircle, Plus, Loader2 } from "lucide-react"
import quickSpicyLogo from "@/assets/quicky-spicy-logo.png"
import { adminAPI } from "@/lib/api"

export default function AdminHome() {
  const navigate = useNavigate()
  const [selectedPeriod, setSelectedPeriod] = useState("overall")
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  // Fetch dashboard stats whenever period or zone changes
  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        setIsLoading(true)
        const params = {}
        if (selectedPeriod && selectedPeriod !== "overall") params.period = selectedPeriod
        const response = await adminAPI.getDashboardStats(params)
        if (response.data?.success && response.data?.data) {
          setDashboardData(response.data.data)
          setHasLoadedOnce(true)
        } else {
          console.error('❌ Invalid response format:', response.data)
        }
      } catch (error) {
        console.error('❌ Error fetching dashboard stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardStats()
    // Auto-refresh every 60 seconds
    const intervalId = setInterval(fetchDashboardStats, 60000)
    return () => clearInterval(intervalId)
  }, [selectedPeriod])

  // Get order stats from real data
  const getOrderStats = () => {
    if (!dashboardData?.orders?.byStatus) {
      return [
        { label: "Delivered", value: 0, color: "#0ea5e9" },
        { label: "Cancelled", value: 0, color: "#ef4444" },
        { label: "Refunded", value: 0, color: "#f59e0b" },
        { label: "Pending", value: 0, color: "#10b981" },
      ]
    }

    const byStatus = dashboardData.orders.byStatus
    return [
      { label: "Delivered", value: byStatus.delivered || 0, color: "#0ea5e9" },
      { label: "Cancelled", value: byStatus.cancelled || 0, color: "#ef4444" },
      { label: "Refunded", value: 0, color: "#f59e0b" }, // Refunded not tracked separately
      { label: "Pending", value: byStatus.pending || 0, color: "#10b981" },
    ]
  }

  // Get monthly data from real data
  const getMonthlyData = () => {
    if (!dashboardData?.monthlyData || dashboardData.monthlyData.length === 0) {
      // Return empty data structure if no data
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return monthNames.map(month => ({ month, commission: 0, revenue: 0, orders: 0 }))
    }

    // Use real monthly data from backend
    return dashboardData.monthlyData.map(item => ({
      month: item.month,
      commission: item.commission || 0,
      revenue: item.revenue || 0,
      orders: item.orders || 0
    }))
  }

  const orderStats = getOrderStats()
  const monthlyData = getMonthlyData()

  // Calculate totals from real data
  const revenueTotal = dashboardData?.revenue?.total || 0
  const commissionTotal = dashboardData?.commission?.total || 0
  const ordersTotal = dashboardData?.orders?.total || 0
  const platformFeeTotal = dashboardData?.platformFee?.total || 0
  const deliveryFeeTotal = dashboardData?.deliveryFee?.total || 0
  const deliveryEarningTotal = dashboardData?.deliveryEarning?.total || 0
  const gstTotal = dashboardData?.gst?.total || 0
  // Total revenue (specific earnings) = Commission + Platform Fee + Delivery Earning + GST
  const totalAdminEarnings = commissionTotal + platformFeeTotal + deliveryEarningTotal + gstTotal

  // Additional stats
  const totalRestaurants = dashboardData?.restaurants?.total || 0
  const pendingRestaurantRequests = dashboardData?.restaurants?.pendingRequests || 0
  const totalDeliveryBoys = dashboardData?.deliveryBoys?.total || 0
  const pendingDeliveryBoyRequests = dashboardData?.deliveryBoys?.pendingRequests || 0
  const totalFoods = dashboardData?.foods?.total || 0
  const totalAddons = dashboardData?.addons?.total || 0
  const totalCustomers = dashboardData?.customers?.total || 0
  const pendingOrders = dashboardData?.orderStats?.pending || 0
  const completedOrders = dashboardData?.orderStats?.completed || 0

  // Map selected dashboard period to Transaction Report time filter
  const transactionTimeMap = {
    overall: "All Time",
    today: "Today",
    week: "This Week",
    month: "This Month",
    year: "All Time",
  }
  const transactionTime = transactionTimeMap[selectedPeriod] || "All Time"
  const transactionReportPath = `/admin/transaction-report?time=${encodeURIComponent(transactionTime)}`
  const taxReportPath = `/admin/tax-report?time=${encodeURIComponent(transactionTime)}`
  const grossRevenueReportPath = `/admin/transaction-report?time=${encodeURIComponent(transactionTime)}&metric=gross&amount=${encodeURIComponent(revenueTotal.toFixed(2))}`
  const totalRevenueReportPath = `/admin/transaction-report?time=${encodeURIComponent(transactionTime)}&metric=total&amount=${encodeURIComponent(totalAdminEarnings.toFixed(2))}`
  const periodLabelMap = {
    overall: "All time",
    today: "Today",
    week: "This week",
    month: "This month",
    year: "This year",
  }
  const selectedPeriodLabel = periodLabelMap[selectedPeriod] || "All time"

  const pieData = orderStats.map((item) => ({
    name: item.label,
    value: item.value,
    fill: item.color,
  }))

  const activityFeed = []

  return (
    <div className="px-4 pb-10 lg:px-6 pt-4">
      <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">

        <div className="flex flex-col gap-4 border-b border-neutral-200 bg-linear-to-br from-white via-neutral-50 to-neutral-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Admin Overview</p>
              <h1 className="text-2xl font-semibold text-neutral-900">Operations Command</h1>
            </div>

          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="min-w-[140px] border-neutral-300 bg-white text-neutral-900">
                <SelectValue placeholder="Overall" />
              </SelectTrigger>
              <SelectContent className="border-neutral-200 bg-white text-neutral-900">
                <SelectItem value="overall">Overall</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="year">This year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Gross revenue"
              value={`₹${revenueTotal.toLocaleString("en-IN")}`}
              helper={selectedPeriodLabel}
              icon={<ShoppingBag className="h-5 w-5 text-emerald-600" />}
              accent="bg-emerald-200/40"
              path={grossRevenueReportPath}
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Commission earned"
              value={`₹${commissionTotal.toLocaleString("en-IN")}`}
              helper="Restaurant commission"
              icon={<ArrowUpRight className="h-5 w-5 text-indigo-600" />}
              accent="bg-indigo-200/40"
              path="/admin/restaurants/commission"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Orders processed"
              value={ordersTotal.toLocaleString("en-IN")}
              helper="Fulfilled & billed"
              icon={<Activity className="h-5 w-5 text-amber-600" />}
              accent="bg-amber-200/40"
              path="/admin/orders/all"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Platform fee"
              value={`₹${platformFeeTotal.toLocaleString("en-IN")}`}
              helper="Total platform fees"
              icon={<CreditCard className="h-5 w-5 text-purple-600" />}
              accent="bg-purple-200/40"
              path={null}
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Delivery earning"
              value={`₹${deliveryEarningTotal.toLocaleString("en-IN")}`}
              helper="Total delivery partner earnings"
              icon={<Truck className="h-5 w-5 text-blue-600" />}
              accent="bg-blue-200/40"
              path="/admin/delivery-partners/earnings"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="GST"
              value={`₹${gstTotal.toLocaleString("en-IN")}`}
              helper="Total GST collected"
              icon={<Receipt className="h-5 w-5 text-orange-600" />}
              accent="bg-orange-200/40"
              path={taxReportPath}
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Total revenue"
              value={`₹${totalAdminEarnings.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              helper={`Commission ₹${commissionTotal.toFixed(2)} + Platform ₹${platformFeeTotal.toFixed(2)} + Delivery Earning ₹${deliveryEarningTotal.toFixed(2)} + GST ₹${gstTotal.toFixed(2)}`}
              icon={<DollarSign className="h-5 w-5 text-green-600" />}
              accent="bg-green-200/40"
              path={totalRevenueReportPath}
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Total restaurants"
              value={totalRestaurants.toLocaleString("en-IN")}
              helper="All registered restaurants"
              icon={<Store className="h-5 w-5 text-blue-600" />}
              accent="bg-blue-200/40"
              path="/admin/restaurants"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Restaurant request pending"
              value={pendingRestaurantRequests.toLocaleString("en-IN")}
              helper="Awaiting approval"
              icon={<UserCheck className="h-5 w-5 text-orange-600" />}
              accent="bg-orange-200/40"
              path="/admin/restaurants/joining-request"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Total delivery boy"
              value={totalDeliveryBoys.toLocaleString("en-IN")}
              helper="All delivery partners"
              icon={<Truck className="h-5 w-5 text-indigo-600" />}
              accent="bg-indigo-200/40"
              path="/admin/delivery-partners"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Delivery boy request pending"
              value={pendingDeliveryBoyRequests.toLocaleString("en-IN")}
              helper="Awaiting verification"
              icon={<Clock className="h-5 w-5 text-yellow-600" />}
              accent="bg-yellow-200/40"
              path="/admin/delivery-partners/join-request"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Total foods"
              value={totalFoods.toLocaleString("en-IN")}
              helper="Active menu items"
              icon={<Package className="h-5 w-5 text-purple-600" />}
              accent="bg-purple-200/40"
              path="/admin/foods"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Total addons"
              value={totalAddons.toLocaleString("en-IN")}
              helper="Active addon items"
              icon={<Plus className="h-5 w-5 text-pink-600" />}
              accent="bg-pink-200/40"
              path="/admin/addons"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Total customers"
              value={totalCustomers.toLocaleString("en-IN")}
              helper="Registered users"
              icon={<UserCircle className="h-5 w-5 text-cyan-600" />}
              accent="bg-cyan-200/40"
              path="/admin/customers"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Pending orders"
              value={pendingOrders.toLocaleString("en-IN")}
              helper="Orders awaiting processing"
              icon={<Clock className="h-5 w-5 text-red-600" />}
              accent="bg-red-200/40"
              path="/admin/orders/pending"
              isLoading={isLoading && !hasLoadedOnce}
            />
            <MetricCard
              title="Completed orders"
              value={completedOrders.toLocaleString("en-IN")}
              helper="Successfully delivered"
              icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
              accent="bg-emerald-200/40"
              path="/admin/orders/delivered"
              isLoading={isLoading && !hasLoadedOnce}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 border-neutral-200 bg-white">
              <CardHeader className="flex flex-col gap-2 border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Revenue trajectory</CardTitle>
                <p className="text-sm text-neutral-500">
                  Commission and gross revenue with order volume for {selectedPeriodLabel.toLowerCase()}
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="comFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#0ea5e9"
                        fillOpacity={1}
                        fill="url(#revFill)"
                        name="Gross revenue"
                      />
                      <Area
                        type="monotone"
                        dataKey="commission"
                        stroke="#a855f7"
                        fillOpacity={1}
                        fill="url(#comFill)"
                        name="Commission"
                      />
                      <Bar
                        dataKey="orders"
                        fill="#ef4444"
                        radius={[6, 6, 0, 0]}
                        name="Orders"
                        barSize={10}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-neutral-200 bg-white">
              <CardHeader className="flex items-center justify-between border-b border-neutral-200 pb-4">
                <div>
                  <CardTitle className="text-lg text-neutral-900">Order mix</CardTitle>
                  <p className="text-sm text-neutral-500">Distribution by state</p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                  {orderStats.reduce((s, o) => s + o.value, 0)} orders
                </span>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend
                        formatter={(value) => <span style={{ color: "#111827", fontSize: 12 }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {orderStats.map((item) => (
                    <div
                      key={item.label}
                      onClick={() => {
                        const routes = {
                          'Delivered': '/admin/orders/delivered',
                          'Cancelled': '/admin/orders/canceled',
                          'Refunded': '/admin/orders/refunded',
                          'Pending': '/admin/orders/pending'
                        }
                        navigate(routes[item.label] || '/admin/orders/all')
                      }}
                      className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2 cursor-pointer hover:bg-neutral-50 hover:border-neutral-300 transition-all group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full transition-transform group-hover:scale-125" style={{ background: item.color }} />
                        <p className="text-sm text-neutral-800 group-hover:text-neutral-900">{item.label}</p>
                      </div>
                      <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-neutral-200 bg-white">
              <CardHeader className="flex items-center justify-between border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Momentum snapshot</CardTitle>
                <span className="text-xs text-neutral-500">No data available</span>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData.slice(-6)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend />
                      <Bar dataKey="orders" fill="#0ea5e9" radius={[8, 8, 0, 0]} name="Orders" />
                      <Bar dataKey="commission" fill="#a855f7" radius={[8, 8, 0, 0]} name="Commission" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-neutral-200 bg-white">
              <CardHeader className="border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Order states</CardTitle>
                <p className="text-sm text-neutral-500">Quick glance by status</p>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4">
                {orderStats.map((item) => (
                  <div
                    key={item.label}
                    onClick={() => {
                      const routes = {
                        'Delivered': '/admin/orders/delivered',
                        'Cancelled': '/admin/orders/canceled',
                        'Refunded': '/admin/orders/refunded',
                        'Pending': '/admin/orders/pending'
                      }
                      navigate(routes[item.label] || '/admin/orders/all')
                    }}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 cursor-pointer hover:bg-neutral-100 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-neutral-900 transition-transform group-hover:scale-110"
                        style={{ background: `${item.color}1A`, color: item.color }}
                      >
                        {item.label.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm text-neutral-900 group-hover:font-medium">{item.label}</p>
                        <p className="text-xs text-neutral-500">Tracked in {selectedPeriod}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value, helper, icon, accent, path, isLoading }) {
  const navigate = useNavigate()
  const isNavigable = Boolean(path)

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-neutral-200 bg-white p-0">
        <CardContent className="relative flex flex-col gap-2 px-4 pb-4 pt-4">
          <div className={`absolute inset-0 ${accent}`} />
          <div className="relative flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-3 w-24 bg-neutral-200 animate-pulse rounded" />
              <div className="h-7 w-20 bg-neutral-200 animate-pulse rounded" />
              <div className="h-3 w-32 bg-neutral-200 animate-pulse rounded" />
            </div>
            <div className="h-11 w-11 rounded-xl bg-neutral-200 animate-pulse" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={`overflow-hidden border-neutral-200 bg-white p-0 ${isNavigable ? "cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]" : ""}`}
      onClick={isNavigable ? () => navigate(path) : undefined}
    >
      <CardContent className="relative flex flex-col gap-2 px-4 pb-4 pt-4">
        <div className={`absolute inset-0 ${accent} `} />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{title}</p>
            <p className="text-2xl font-semibold text-neutral-900">{value}</p>
            <p className="text-xs text-neutral-500">{helper}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 ring-1 ring-neutral-200 shadow-sm transition-transform duration-300 group-hover:rotate-12">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
