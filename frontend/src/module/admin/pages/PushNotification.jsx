import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Search, Download, ChevronDown, Bell, Edit, Trash2, Upload, Settings, Image as ImageIcon } from "lucide-react"
import { adminAPI } from "../../../lib/api";

export default function PushNotification() {
  const fileInputRef = useRef(null)
  const [formData, setFormData] = useState({
    title: "",
    zone: "All",
    sendTo: "Customer",
    description: "",
  })
  const [bannerPreview, setBannerPreview] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [notifications, setNotifications] = useState([])
  const [zones, setZones] = useState([])
  const [editingNotificationId, setEditingNotificationId] = useState(null)

  const handleExport = () => {
    try {
      if (!filteredNotifications || filteredNotifications.length === 0) {
        alert("No notifications available to export")
        return
      }

      const headers = ["SI", "Title", "Description", "Zone", "Target", "Status", "Has Image"]
      const rows = filteredNotifications.map((n) => [
        n.sl ?? "",
        (n.title || "").replace(/"/g, '""'),
        (n.description || "").replace(/"/g, '""'),
        n.zone || "",
        n.target || "",
        n.status ? "Active" : "Inactive",
        n.image ? "Yes" : "No",
      ])

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => (typeof cell === "string" && cell.includes(",") ? `"${cell}"` : cell)).join(",")),
      ].join("\n")

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", "push-notifications.csv")
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export notifications:", error)
      alert("Failed to export notifications")
    }
  }

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await adminAPI.getPushNotifications()
      const rawNotifications = response?.data?.data?.notifications || []
      const normalized = rawNotifications.map((item, index) => ({
        _id: item._id,
        sl: index + 1,
        title: item.title || "",
        description: item.description || "",
        zone: item.zone || "All",
        target: item.sendTo || "Customer",
        status: item.status !== false,
        image: Boolean(item.imageUrl),
        imageUrl: item.imageUrl || null,
      }))
      setNotifications(normalized)
    } catch (error) {
      console.error("Failed to fetch push notifications:", error)
      setNotifications([])
    }
  }, [])

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const response = await adminAPI.getZones({ limit: 1000 })
        if (response?.data?.success && response.data?.data?.zones) {
          setZones(response.data.data.zones)
        } else if (Array.isArray(response?.data?.data)) {
          setZones(response.data.data)
        }
      } catch (error) {
        console.error("Failed to fetch zones:", error)
      }
    }
    fetchZones()
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) {
      return notifications
    }

    const query = searchQuery.toLowerCase().trim()
    return notifications.filter(notification =>
      String(notification.title || "").toLowerCase().includes(query) ||
      String(notification.description || "").toLowerCase().includes(query)
    )
  }, [notifications, searchQuery])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title.trim() || !formData.description.trim()) {
      alert("Title and description are required")
      return
    }

    try {
      const file = fileInputRef.current?.files?.[0];
      let response;
      if (file) {
        const payload = new FormData();
        payload.append("title", formData.title.trim());
        payload.append("description", formData.description.trim());
        payload.append("zone", formData.zone);
        payload.append("sendTo", formData.sendTo);
        payload.append("image", file);
        response = editingNotificationId
          ? await adminAPI.updatePushNotification(editingNotificationId, payload)
          : await adminAPI.sendPushNotification(payload);
      } else {
        const payload = {
          title: formData.title.trim(),
          description: formData.description.trim(),
          zone: formData.zone,
          sendTo: formData.sendTo
        };
        response = editingNotificationId
          ? await adminAPI.updatePushNotification(editingNotificationId, payload)
          : await adminAPI.sendPushNotification(payload);
      }

      if (response && response.data && response.data.success) {
        alert(
          response.data.message ||
          (editingNotificationId
            ? "Push notification updated successfully!"
            : "Push notifications sent successfully!"),
        );
        await fetchNotifications()
        handleReset()
      } else {
        alert(response?.data?.message || "Failed to save notification");
      }
    } catch (error) {
      console.error("Error saving push notification:", error);
      alert("Error saving push notification. " + (error.response?.data?.message || error.message));
    }
  }

  const handleReset = () => {
    setFormData({
      title: "",
      zone: "All",
      sendTo: "Customer",
      description: "",
    })
    setBannerPreview("")
    setEditingNotificationId(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleBannerSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      alert("Image size must be 2MB or less")
      event.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setBannerPreview(String(reader.result || ""))
    }
    reader.readAsDataURL(file)
  }

  const handleEdit = (notification) => {
    setEditingNotificationId(notification._id)
    setFormData({
      title: notification.title || "",
      zone: notification.zone || "All",
      sendTo: notification.target || "Customer",
      description: notification.description || "",
    })
    setBannerPreview(notification.imageUrl || "")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleToggleStatus = async (notificationId) => {
    try {
      await adminAPI.togglePushNotificationStatus(notificationId)
      await fetchNotifications()
    } catch (error) {
      console.error("Failed to update notification status:", error)
      alert(error?.response?.data?.message || "Failed to update notification status")
    }
  }

  const handleDelete = async (notificationId) => {
    if (window.confirm("Are you sure you want to delete this notification?")) {
      try {
        await adminAPI.deletePushNotification(notificationId)
        await fetchNotifications()
      } catch (error) {
        console.error("Failed to delete notification:", error)
        alert(error?.response?.data?.message || "Failed to delete notification")
      }
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Create New Notification Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Bell className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Notification</h1>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="Ex: Notification Title"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Zone
                </label>
                <select
                  value={formData.zone}
                  onChange={(e) => handleInputChange("zone", e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="All">All</option>
                  {zones.map((zone) => (
                    <option key={zone._id} value={zone.name}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Send To
                </label>
                <select
                  value={formData.sendTo}
                  onChange={(e) => handleInputChange("sendTo", e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="Customer">Customer</option>
                  <option value="Delivery Man">Delivery Man</option>
                  <option value="Restaurant">Restaurant</option>
                </select>
              </div>
            </div>

            {/* Notification Banner Upload */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Notification banner
              </label>
              <div
                className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-blue-600 mb-1">Upload Image</p>
                <p className="text-xs text-slate-500">Image format - jpg png jpeg gif webp Image Size -maximum size 2 MB Image Ratio - 3:1</p>
                {bannerPreview && (
                  <div className="mt-4">
                    <img src={bannerPreview} alt="Notification banner preview" className="mx-auto h-20 rounded-lg object-cover" />
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerSelect}
                className="hidden"
              />
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder="Ex: Notification Descriptions"
                rows={4}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                {editingNotificationId ? "Cancel Edit" : "Reset"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md"
                >
                  {editingNotificationId ? "Update Notification" : "Send Notification"}
                </button>
                <button className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Notification List Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Notification List</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {filteredNotifications.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search by title"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <button
                type="button"
                onClick={handleExport}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!filteredNotifications || filteredNotifications.length === 0}
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SI</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Image</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Zone</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Target</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredNotifications.map((notification) => (
                  <tr
                    key={notification._id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{notification.sl}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-900">{notification.title}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">{notification.description}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {notification.image ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100">
                          <img
                            src={notification.imageUrl}
                            alt={notification.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = "none"
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{notification.zone}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{notification.target}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(notification._id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${notification.status ? "bg-blue-600" : "bg-slate-300"
                          }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notification.status ? "translate-x-6" : "translate-x-1"
                            }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(notification)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(notification._id)}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
