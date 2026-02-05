const Footer = () => {
  return (
    <footer className="bg-white border-t border-nordic-gray-200">
      <div className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-nordic-blue rounded-lg"></div>
              <span className="text-xl font-light text-nordic-gray-800">Plumy</span>
            </div>
            <p className="text-sm text-nordic-gray-600 font-light leading-relaxed">
              Simple, powerful project management for desktop.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-nordic-gray-800 mb-4 uppercase tracking-wider">Product</h4>
            <ul className="space-y-3">
              <li><a href="#features" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">Features</a></li>
              <li><a href="#download" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">Download</a></li>
              <li><a href="#" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">Changelog</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-medium text-nordic-gray-800 mb-4 uppercase tracking-wider">Support</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">Documentation</a></li>
              <li><a href="#" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">Help Center</a></li>
              <li><a href="#" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">Contact</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-medium text-nordic-gray-800 mb-4 uppercase tracking-wider">Legal</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">Terms of Service</a></li>
              <li><a href="#" className="text-sm text-nordic-gray-600 hover:text-nordic-gray-800 font-light transition-colors">License</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-nordic-gray-200">
          <p className="text-sm text-nordic-gray-500 font-light text-center">
            © 2026 Plumy. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
