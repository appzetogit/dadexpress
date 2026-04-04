import React from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion } from "framer-motion"
import { 
  ArrowLeft, 
  MessageCircle, 
  Phone, 
  Mail, 
  ChevronRight, 
  Clock, 
  ShieldCheck, 
  HelpCircle,
  Headphones as HeadphonesIcon
} from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function ContactSupport() {
  const navigate = useNavigate()

  const supportOptions = [
    {
      title: "Chat with Support",
      description: "Fastest way to get help with your orders",
      icon: MessageCircle,
      link: "/user/support-chat",
      color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
      badge: "Fast Response"
    },
    {
      title: "Call Us",
      description: "Speak directly with our support team",
      icon: Phone,
      link: "tel:+919876543210", // Example number, should be replaced with actual
      color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
      external: true
    },
    {
      title: "Email Support",
      description: "Send us your queries anytime",
      icon: Mail,
      link: "mailto:support@dadexpress.com",
      color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
      external: true
    }
  ]

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-md mx-auto px-4 py-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            className="h-10 w-10 p-0 rounded-full bg-white dark:bg-[#1a1a1a] shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
          </Button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Contact Support</h1>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900/20 mb-4">
            <HeadphonesIcon className="h-10 w-10 text-orange-600 dark:text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">How can we help?</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Our team is available 24/7 to assist you with any issues or questions.
          </p>
        </div>

        {/* Support Options */}
        <div className="space-y-4 mb-8">
          {supportOptions.map((option, index) => {
            const Icon = option.icon
            const Component = option.external ? 'a' : Link
            const props = option.external ? { href: option.link } : { to: option.link }

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Component {...props} className="block group">
                  <Card className="bg-white dark:bg-[#1a1a1a] border-0 shadow-sm hover:shadow-md transition-all rounded-2xl overflow-hidden">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${option.color} group-hover:scale-110 transition-transform`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                             <h3 className="font-bold text-gray-900 dark:text-white">{option.title}</h3>
                             {option.badge && (
                               <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full dark:bg-orange-900/40 dark:text-orange-400">
                                 {option.badge}
                               </span>
                             )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600 group-hover:translate-x-1 transition-transform" />
                    </CardContent>
                  </Card>
                </Component>
              </motion.div>
            )
          })}
        </div>

        {/* Info Section */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="bg-white dark:bg-[#1a1a1a] border-0 shadow-sm rounded-2xl">
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 text-gray-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-gray-900 dark:text-white">Response Time</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Under 5 mins</p>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-[#1a1a1a] border-0 shadow-sm rounded-2xl">
            <CardContent className="p-4 text-center">
              <ShieldCheck className="h-5 w-5 text-gray-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-gray-900 dark:text-white">Secure Support</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">100% Private</p>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Link */}
        <Link to="/user/help" className="block text-center mt-4">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-orange-600 hover:underline">
            <HelpCircle className="h-4 w-4" />
            Check frequently asked questions
          </div>
        </Link>
      </div>
    </AnimatedPage>
  )
}
