const Features = () => {
  const features = [
    {
      title: 'Dual-View System',
      description: 'Switch seamlessly between Timeline and Kanban views to match your workflow.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
    {
      title: 'Timeline Planning',
      description: 'Visual calendar-based planning with drag-and-drop tasks, color-coded swimlanes, and flexible date ranges.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: 'Kanban Workflow',
      description: 'Traditional column-based task management. Organize work by status with customizable columns.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 4H5a2 2 0 00-2 2v14a2 2 0 002 2h4M9 4h6M9 4v16M15 4h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M15 4v16" />
        </svg>
      ),
    },
    {
      title: 'Swimlane Organization',
      description: 'Group tasks by teams or projects. Each swimlane has customizable colors for visual clarity.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
        </svg>
      ),
    },
    {
      title: 'Local-First',
      description: 'All your data stays on your computer. Works completely offline. No cloud required.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      ),
    },
    {
      title: 'Free Forever',
      description: 'Completely free to download and use. No subscriptions, no hidden costs, no feature limitations.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <section id="features" className="py-32 bg-white">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-5xl font-light text-nordic-gray-800 mb-6 text-center">
            Everything you need
          </h2>
          <p className="text-xl text-nordic-gray-600 font-light mb-20 text-center max-w-2xl mx-auto">
            Simple, powerful tools to organize your projects your way
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-16">
            {features.map((feature, index) => (
              <div key={index} className="space-y-4">
                <div className="text-nordic-blue">
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-light text-nordic-gray-800">
                  {feature.title}
                </h3>
                <p className="text-nordic-gray-600 font-light leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Features
