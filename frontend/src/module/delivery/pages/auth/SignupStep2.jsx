import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, X, Check, Camera } from "lucide-react"
import { deliveryAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

export default function SignupStep2() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState({
    profilePhoto: null,
    aadharPhoto: null,
    aadharBackPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null,
    vehicleRCPhoto: null,
    vehicleRCBackPhoto: null
  })
  const [uploadedDocs, setUploadedDocs] = useState(() => {
    const saved = sessionStorage.getItem("deliverySignupDocs")
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error("Error parsing saved docs:", e)
      }
    }
    return {
      profilePhoto: null,
      aadharPhoto: null,
      aadharBackPhoto: null,
      panPhoto: null,
      drivingLicensePhoto: null,
      vehicleRCPhoto: null,
      vehicleRCBackPhoto: null
    }
  })
  const [uploading, setUploading] = useState({
    profilePhoto: false,
    aadharPhoto: false,
    aadharBackPhoto: false,
    panPhoto: false,
    drivingLicensePhoto: false,
    vehicleRCPhoto: false,
    vehicleRCBackPhoto: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const parseCameraResult = (rawResult) => {
    let result = rawResult

    // Some bridges return [result] or JSON string payload.
    if (Array.isArray(result)) {
      result = result[0]
    }
    if (typeof result === "string") {
      try {
        result = JSON.parse(result)
      } catch {
        return null
      }
    }

    if (!result || !result.success || !result.base64) {
      return null
    }

    return result
  }

  const convertBase64ToFile = (cameraResult, docType) => {
    const base64Content = cameraResult.base64.includes(",")
      ? cameraResult.base64.split(",").pop()
      : cameraResult.base64

    const byteString = atob(base64Content)
    const uint8Array = new Uint8Array(byteString.length)
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i)
    }

    const mimeType = cameraResult.mimeType || "image/jpeg"
    const extension = mimeType.split("/")[1] || "jpg"
    const fileName = cameraResult.fileName || `${docType}-${Date.now()}.${extension}`
    return new File([uint8Array], fileName, { type: mimeType })
  }

  const handleCameraCapture = async (docType) => {
    try {
      if (!window.flutter_inappwebview?.callHandler) {
        toast.error("Live camera is only available in the app")
        return
      }

      const rawResult = await window.flutter_inappwebview.callHandler("openCamera")
      const cameraResult = parseCameraResult(rawResult)

      if (!cameraResult) {
        toast.error("No photo captured from camera")
        return
      }

      const file = convertBase64ToFile(cameraResult, docType)
      await handleFileSelect(docType, file)
    } catch (error) {
      console.error("Camera error:", error)
      toast.error("Failed to capture photo from camera")
    }
  }


  // Save uploaded docs to session storage whenever they change
  useEffect(() => {
    sessionStorage.setItem("deliverySignupDocs", JSON.stringify(uploadedDocs))
  }, [uploadedDocs])

  const handleFileSelect = async (docType, file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB")
      return
    }

    setUploading(prev => ({ ...prev, [docType]: true }))

    try {
      const response = await uploadAPI.uploadMedia(file, {
        folder: "appzeto/delivery/documents",
      })

      if (response?.data?.success && response?.data?.data) {
        const { url, publicId } = response.data.data

        setDocuments(prev => ({
          ...prev,
          [docType]: file
        }))

        setUploadedDocs(prev => ({
          ...prev,
          [docType]: { url, publicId }
        }))

        toast.success(`${docType.replace(/([A-Z])/g, ' $1').trim()} uploaded successfully`)
      }
    } catch (error) {
      console.error(`Error uploading ${docType}:`, error)
      toast.error(`Failed to upload ${docType.replace(/([A-Z])/g, ' $1').trim()}`)
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }))
    }
  }

  const handleRemove = (docType) => {
    setDocuments(prev => ({
      ...prev,
      [docType]: null
    }))
    setUploadedDocs(prev => ({
      ...prev,
      [docType]: null
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Check if all required documents are uploaded
    if (!uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.aadharBackPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto) {
      toast.error("Please upload all required documents")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await deliveryAPI.submitSignupDocuments({
        profilePhoto: uploadedDocs.profilePhoto,
        aadharPhoto: uploadedDocs.aadharPhoto,
        aadharBackPhoto: uploadedDocs.aadharBackPhoto,
        panPhoto: uploadedDocs.panPhoto,
        drivingLicensePhoto: uploadedDocs.drivingLicensePhoto,
        vehicleRCPhoto: uploadedDocs.vehicleRCPhoto,
        vehicleRCBackPhoto: uploadedDocs.vehicleRCBackPhoto
      })

      if (response?.data?.success) {
        toast.success("Signup completed successfully!")
        // Redirect to delivery home page
        setTimeout(() => {
          navigate("/delivery", { replace: true })
        }, 1000)
      }
    } catch (error) {
      console.error("Error submitting documents:", error)
      const message = error?.response?.data?.message || "Failed to submit documents. Please try again."
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const DocumentUpload = ({ docType, label, required = true }) => {
    const file = documents[docType]
    const uploaded = uploadedDocs[docType]
    const isUploading = uploading[docType]

    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        {uploaded ? (
          <div className="relative">
            <img
              src={uploaded.url}
              alt={label}
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={() => handleRemove(docType)}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm">
              <Check className="w-4 h-4" />
              <span>Uploaded</span>
            </div>
          </div>
        ) : (
          <div className="flex border-2 border-dashed border-gray-300 rounded-lg overflow-hidden h-48">
            {/* Click to Upload - opens gallery */}
            <label className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors border-r border-dashed border-gray-300 relative">
              {isUploading ? (
                <div className="flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mb-2"></div>
                  <p className="text-xs text-gray-500">Uploading...</p>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-600">Click to upload</p>
                  <p className="text-[10px] text-gray-400">Gallery</p>
                </>
              )}
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const selectedFile = e.target.files[0]
                  if (selectedFile) {
                    handleFileSelect(docType, selectedFile)
                  }
                }}
                disabled={isUploading}
              />
            </label>

            {/* Live Camera - opens camera via bridge */}
            <button
              type="button"
              onClick={() => handleCameraCapture(docType)}
              disabled={isUploading}
              className="flex-1 flex flex-col items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <Camera className="w-6 h-6 text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-600">Live Camera</p>
              <p className="text-[10px] text-gray-400">Capture Photo</p>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => navigate((window.history?.state?.idx ?? 0) > 0 ? -1 : "/delivery")}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Upload Documents</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Document Verification</h2>
          <p className="text-sm text-gray-600">Please upload clear photos of your documents</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DocumentUpload docType="profilePhoto" label="Profile Photo" required={true} />
          <DocumentUpload docType="aadharPhoto" label="Aadhar Card Photo (Front)" required={true} />
          <DocumentUpload docType="aadharBackPhoto" label="Aadhar Card Photo (Back)" required={true} />
          <DocumentUpload docType="panPhoto" label="PAN Card Photo" required={true} />
          <DocumentUpload docType="drivingLicensePhoto" label="Driving License Photo" required={true} />
          <DocumentUpload docType="vehicleRCPhoto" label="Vehicle RC Photo (Front)" required={false} />
          <DocumentUpload docType="vehicleRCBackPhoto" label="Vehicle RC Photo (Back)" required={false} />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.aadharBackPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto}
            className={`w-full py-4 rounded-lg font-bold text-white text-base transition-colors mt-6 ${isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.aadharBackPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B761] hover:bg-[#00A055]"
              }`}
          >
            {isSubmitting ? "Submitting..." : "Complete Signup"}
          </button>
        </form>
      </div>
    </div>
  )
}


