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

          <div className="grid md:grid-cols-3 gap-6">
            <a href="https://github.com/lorddarq/Plumy/releases/latest/download/Plumy-darwin-arm64.dmg" className="p-8 bg-white border border-nordic-gray-200 rounded-lg hover:border-nordic-blue hover:shadow-md transition-all group">
              <svg className="w-12 h-12 mx-auto mb-4 text-nordic-gray-700 group-hover:text-nordic-blue transition-colors" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <h3 className="text-lg font-light text-nordic-gray-800 mb-2">macOS</h3>
              <p className="text-sm text-nordic-gray-600 font-light mb-4">macOS 11+</p>
              <span className="text-sm text-nordic-blue font-light">Download →</span>
            </a>

            <div className="p-8 bg-nordic-gray-50 border border-nordic-gray-200 rounded-lg opacity-60 cursor-not-allowed">
              <svg className="w-12 h-12 mx-auto mb-4 text-nordic-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
              </svg>
              <h3 className="text-lg font-light text-nordic-gray-800 mb-2">Windows</h3>
              <p className="text-sm text-nordic-gray-600 font-light mb-4">Windows 10+</p>
              <span className="text-sm text-nordic-gray-500 font-light">Coming soon</span>
            </div>

            <div className="p-8 bg-nordic-gray-50 border border-nordic-gray-200 rounded-lg opacity-60 cursor-not-allowed">
              <svg className="w-12 h-12 mx-auto mb-4 text-nordic-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.84-.415 1.6-.406 2.289.009.753.232 1.467.645 2.08.601.89 1.621 1.346 2.631 1.346.247 0 .499-.034.744-.104 1.346-.385 2.024-1.834 1.51-3.23-.09-.243-.127-.498-.127-.756 0-.507.166-.986.455-1.382.289-.399.684-.709 1.135-.895l.025-.01c.136-.054.277-.1.423-.136.424-.104.853-.156 1.272-.156.31 0 .615.034.905.1.586.134 1.097.39 1.515.739.42.348.745.782.961 1.27.108.244.163.506.163.777 0 .498-.153.963-.431 1.345-.277.382-.667.676-1.117.846-.449.17-.926.256-1.408.256-.482 0-.96-.086-1.41-.256-.45-.17-.84-.464-1.117-.846-.278-.382-.431-.847-.431-1.345 0-.271.055-.533.163-.777.216-.488.541-.922.961-1.27.418-.349.929-.605 1.515-.739.29-.066.595-.1.905-.1.419 0 .848.052 1.272.156.146.036.287.082.423.136l.025.01c.451.186.846.496 1.135.895.289.396.455.875.455 1.382 0 .258-.037.513-.127.756-.514 1.396.164 2.845 1.51 3.23.245.07.497.104.744.104 1.01 0 2.03-.456 2.631-1.346.413-.613.636-1.327.645-2.08.009-.689-.128-1.449-.406-2.289-.589-1.771-1.831-3.47-2.716-4.521-.75-1.067-.974-1.928-1.05-3.02-.065-1.491 1.056-5.965-3.17-6.298-.165-.013-.325-.021-.48-.021z"/>
              </svg>
              <h3 className="text-lg font-light text-nordic-gray-800 mb-2">Linux</h3>
              <p className="text-sm text-nordic-gray-600 font-light mb-4">Ubuntu, Debian, Fedora</p>
              <span className="text-sm text-nordic-gray-500 font-light">Coming soon</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Download
