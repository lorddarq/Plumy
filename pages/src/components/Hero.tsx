const Hero = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Navigation */}
      <nav className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-nordic-blue rounded-lg"></div>
            <span className="text-2xl font-light text-nordic-gray-800">Plumy</span>
          </div>
          <div className="hidden md:flex space-x-12">
            <a href="#features" className="text-nordic-gray-600 hover:text-nordic-gray-800 transition-colors text-sm font-light">Features</a>
            <a href="#download" className="text-nordic-gray-600 hover:text-nordic-gray-800 transition-colors text-sm font-light">Download</a>
          </div>
        </div>
      </nav>

      {/* Hero Content */}
      <div className="container mx-auto px-6 pt-24 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-6xl md:text-7xl font-light text-nordic-gray-800 mb-8 tracking-tight leading-tight">
            Project management,
            <br />
            <span className="text-nordic-blue">simplified</span>
          </h1>
          <p className="text-xl md:text-2xl text-nordic-gray-600 font-light mb-16 leading-relaxed max-w-2xl mx-auto">
            A free desktop application that brings clarity to your projects. Timeline and Kanban views. Local-first. No subscriptions.
          </p>
          <a
            href="#download"
            className="inline-block px-12 py-4 bg-nordic-gray-800 text-white font-light text-lg rounded-lg hover:bg-nordic-gray-700 transition-colors"
          >
            Download for macOS
          </a>
          <p className="mt-6 text-sm text-nordic-gray-500 font-light">
            Also available for Windows and Linux
          </p>
        </div>

        {/* App Screenshot Mockup */}
        <div className="mt-24 max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-nordic-gray-200 overflow-hidden">
            {/* App Header */}
            <div className="bg-white border-b border-nordic-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-8">
                  <span className="text-lg font-light">plumy</span>
                  <div className="flex space-x-1">
                    <button className="px-4 py-1.5 text-sm font-light border-b-2 border-nordic-gray-800">Timeline</button>
                    <button className="px-4 py-1.5 text-sm font-light text-nordic-gray-500">Kanban</button>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-6 h-6 rounded-full bg-nordic-gray-100"></div>
                  <div className="w-6 h-6 rounded-full bg-nordic-gray-800"></div>
                </div>
              </div>
            </div>

            {/* Timeline View */}
            <div className="flex">
              {/* Sidebar */}
              <div className="w-48 bg-white border-r border-nordic-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-medium text-nordic-gray-600 uppercase tracking-wider">Swimlanes</span>
                  <button className="text-nordic-gray-400 hover:text-nordic-gray-600">+</button>
                </div>
                <div className="space-y-2">
                  {['Grazy', 'Inklebot', 'Plumy', 'Website'].map((project) => (
                    <div key={project} className="px-2 py-1.5 text-sm font-light text-nordic-gray-700 hover:bg-nordic-gray-50 rounded cursor-pointer">
                      {project}
                    </div>
                  ))}
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="flex-1 bg-gradient-to-br from-nordic-gray-50/50 to-white p-6 overflow-hidden">
                {/* Date Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <button className="text-nordic-gray-600">←</button>
                    <span className="text-sm font-light">Mar 26</span>
                    <button className="text-nordic-gray-600">→</button>
                  </div>
                  <span className="text-xs font-light text-nordic-gray-500">7 days</span>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-4 mb-4 px-2">
                  {[6, 7, 8, 9, 10, 11, 12].map((day) => (
                    <div key={day} className="text-center">
                      <span className="text-xs font-light text-nordic-gray-500">{day}</span>
                    </div>
                  ))}
                </div>

                {/* Task Swimlanes */}
                <div className="space-y-6">
                  {/* Grazy swimlane */}
                  <div className="relative h-16 bg-amber-50/30 rounded-lg border border-amber-100/50">
                    <div className="absolute left-0 top-2 w-4/5 h-10 bg-gradient-to-r from-amber-200 to-amber-100 rounded-md shadow-sm border border-amber-200 flex items-center px-3">
                      <span className="text-xs font-light text-amber-900">Add licensing support</span>
                    </div>
                  </div>

                  {/* Inklebot swimlane */}
                  <div className="relative h-16 bg-slate-50/30 rounded-lg border border-slate-100/50">
                    <div className="absolute left-1/4 top-2 w-2/5 h-10 bg-gradient-to-r from-slate-300 to-slate-200 rounded-md shadow-sm border border-slate-300 flex items-center px-3">
                      <span className="text-xs font-light text-slate-700">Export tokens as sheets</span>
                    </div>
                  </div>

                  {/* Plumy swimlane */}
                  <div className="relative h-16 bg-green-50/30 rounded-lg border border-green-100/50">
                    <div className="absolute left-0 top-2 w-1/4 h-10 bg-gradient-to-r from-green-300 to-green-200 rounded-md shadow-sm border border-green-300"></div>
                  </div>

                  {/* Website swimlane */}
                  <div className="relative h-16 bg-purple-50/30 rounded-lg border border-purple-100/50"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
