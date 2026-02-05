const Download = () => {
  return (
    <section id="download" className="py-32 bg-nordic-gray-50">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl font-light text-nordic-gray-800 mb-6">
            Download for free
          </h2>
          <p className="text-xl text-nordic-gray-600 font-light mb-12 max-w-2xl mx-auto">
            Get Plumy now and start organizing your projects. Free forever, no account required.
          </p>

          <div className="flex flex-col items-center gap-6">
            <a 
              href="https://github.com/lorddarq/Plumy/releases/latest" 
              className="inline-flex items-center gap-3 px-8 py-4 bg-nordic-blue text-black rounded-lg hover:bg-nordic-blue/90 transition-all shadow-md hover:shadow-lg font-light text-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Latest Release
            </a>
            
            <p className="text-sm text-nordic-gray-600 font-light">
              Available for macOS, Windows, and Linux
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Download
