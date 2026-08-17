import { Download } from 'lucide-react'

const navLinks = [
  { href: '#why-omvra', label: 'Why Omvra' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#acp', label: 'ACP' },
  { href: '#privacy', label: 'Privacy' },
]

const logoSrc = `${import.meta.env.BASE_URL}illustrations/logo.svg`
const timelineSrc = `${import.meta.env.BASE_URL}illustrations/timeline.svg`

const Hero = () => {
  return (
    <section className="relative overflow-hidden bg-[#f8f7f5]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(214,195,170,0.38),transparent_34%),radial-gradient(circle_at_left,rgba(210,204,195,0.24),transparent_42%),linear-gradient(180deg,#f8f7f5_0%,#fbfaf8_50%,#f7f5f2_100%)]"
      />

      <nav className="landing-container relative z-10 py-6 sm:py-8">
        <div className="flex items-center justify-between gap-6">
          <a href="#" className="inline-flex items-center">
            <img src={logoSrc} alt="Omvra" className="h-8 w-auto sm:h-9" />
          </a>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-[#555461] transition-colors duration-150 hover:text-[#2e2d37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f7f5]"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#download"
              className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[#3b3b43] px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#2f2f36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f7f5]"
            >
              Download
            </a>
          </div>
        </div>
      </nav>

      <div className="landing-container relative z-10 pb-16 pt-10 sm:pb-20 sm:pt-14 lg:pb-24 lg:pt-16">
        <div className="mx-auto max-w-[52rem] text-center">
          <h1 className="text-balance text-[clamp(3rem,7vw,5rem)] font-medium leading-[0.96] tracking-[-0.06em] text-[#5a5868]">
            Keep work private. Move it forward.
            <br />
            <span className="relative inline-block pr-2">
              Work with your agents.
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-pretty text-lg leading-8 text-[#6d6a73] sm:text-xl">
            Omvra is a free, open-source workspace for planning and executing work with AI agents.
            Your project data stays on your device while local agent access keeps work assigned,
            visible, and ready for human review.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#download"
              className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#3b3b43] px-8 py-4 text-lg font-semibold text-white shadow-[0_8px_20px_rgba(59,59,67,0.18)] transition-[transform,background-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-[#303038] hover:shadow-[0_12px_24px_rgba(59,59,67,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f7f5]"
            >
              <Download className="size-5" strokeWidth={2.2} />
              Download Omvra
            </a>
            <a
              href="https://github.com/lorddarq/omvra"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-white/70 px-8 py-4 text-lg font-medium text-[#54515f] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] backdrop-blur transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f7f5]"
            >
              View on GitHub
            </a>
          </div>
        </div>

        <div className="relative mx-auto mt-16 h-[260px] max-w-[72rem] sm:h-[360px] md:h-[470px] lg:h-[600px] xl:h-[749px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-10 top-10 h-32 rounded-full bg-[rgba(211,193,169,0.22)] blur-[90px] sm:h-44 sm:blur-[110px]"
          />
          <img
            src={timelineSrc}
            alt="Omvra timeline preview"
            className="absolute left-1/2 top-0 h-auto w-[58rem] max-w-[155%] -translate-x-1/2 drop-shadow-[0_24px_48px_rgba(17,24,39,0.08)] sm:w-[70rem] md:w-[82rem] lg:w-[90rem] xl:w-[1442px]"
          />
        </div>
      </div>
    </section>
  )
}

export default Hero
