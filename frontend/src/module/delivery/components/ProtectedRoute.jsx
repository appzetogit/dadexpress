import { Navigate } from "react-router-dom"
import { useEffect } from "react"
import { isModuleAuthenticated } from "@/lib/utils/auth"

export default function ProtectedRoute({ children }) {
  useEffect(() => {
    document.body.classList.add("delivery-module")
    const meta = document.querySelector('meta[name="viewport"]')
    const prevContent = meta?.getAttribute("content") || ""
    if (meta) {
      meta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
      )
    }

    return () => {
      document.body.classList.remove("delivery-module")
      if (meta) {
        meta.setAttribute("content", prevContent)
      }
    }
  }, [])

  // Check if user is authenticated using proper token validation
  const isAuthenticated = isModuleAuthenticated("delivery")

  if (!isAuthenticated) {
    return <Navigate to="/delivery/sign-in" replace />
  }

  return children
}

