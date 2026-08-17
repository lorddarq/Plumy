const logoSrc = `${import.meta.env.BASE_URL}illustrations/logo.svg`

const linkClassName =
  'text-sm font-medium text-[#232228] transition-colors duration-150 hover:text-[#5b5966] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/8 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf8]'

const Footer = () => {
  return (
    <footer className="bg-[#fbfaf8]">
      <div className="landing-container py-20 md:py-24">
        <div className="grid gap-14 lg:grid-cols-[250px_minmax(0,648px)] lg:items-start lg:justify-between">
          <div className="max-w-[15.625rem]">
            <img src={logoSrc} alt="Omvra" className="h-8 w-auto" />
            <p className="mt-5 text-sm leading-9 text-[#6d6a73]">
              Free, open-source, local-first execution for teams that want clarity, speed, and control.
            </p>
          </div>

          <div className="grid gap-12 sm:grid-cols-3 sm:gap-8 lg:gap-12">
            <div>
              <h4 className="text-[0.72rem] font-medium uppercase tracking-[0.22em] text-[#8f8b93]">
                Product
              </h4>
              <ul className="mt-4 space-y-3">
                <li><a href="#why-omvra" className={linkClassName}>Why Omvra</a></li>
                <li><a href="#features" className={linkClassName}>Features</a></li>
                <li><a href="#how-it-works" className={linkClassName}>How it works</a></li>
                <li><a href="#acp" className={linkClassName}>ACP runtime</a></li>
                <li><a href="#privacy" className={linkClassName}>Privacy</a></li>
                <li><a href="#download" className={linkClassName}>Download</a></li>
                <li><a href="#faq" className={linkClassName}>FAQ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[0.72rem] font-medium uppercase tracking-[0.22em] text-[#8f8b93]">
                Proof
              </h4>
              <ul className="mt-4 space-y-3">
                <li><a href="https://github.com/lorddarq/omvra" className={linkClassName}>GitHub repository</a></li>
                <li><a href="https://github.com/lorddarq/omvra/releases" className={linkClassName}>Releases</a></li>
                <li><a href="https://github.com/lorddarq/omvra#readme" className={linkClassName}>Documentation</a></li>
                <li><a href="#agent-prompts" className={linkClassName}>AI workflows</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[0.72rem] font-medium uppercase tracking-[0.22em] text-[#8f8b93]">
                Project
              </h4>
              <ul className="mt-4 space-y-3">
                <li><a href="https://github.com/lorddarq/omvra/blob/main/LICENSE" className={linkClassName}>License</a></li>
                <li><a href="https://github.com/lorddarq/omvra/issues" className={linkClassName}>Issues</a></li>
                <li><a href="https://github.com/lorddarq/omvra/actions" className={linkClassName}>Build status</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 border-t border-black/6 pt-7">
          <div className="flex flex-col gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <p className="text-sm text-[#78737b]">© 2026 Omvra. All rights reserved.</p>
            <a
              href="https://grazy.sorinjurcut.com/"
              className="text-sm text-[#78737b] transition-colors duration-150 hover:text-[#5b5966] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/8 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf8]"
            >
              Built with Grazy in Figma
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
