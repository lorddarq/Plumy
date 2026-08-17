import { Check, CircleDot, RefreshCw, ShieldCheck, Terminal } from 'lucide-react'

const providers = [
  {
    name: 'Claude Code',
    mode: 'stream-json over stdio',
    detail: 'Native CLI sessions with the current Omvra MCP endpoint attached at launch.',
    accent: '#8b6fd6',
  },
  {
    name: 'Codex',
    mode: 'app-server over stdio',
    detail: 'Native app-server sessions with model and approval policy controls.',
    accent: '#cf9b55',
  },
] as const

const ACPSection = () => {
  return (
    <section id="acp" className="overflow-hidden bg-[#f3f0eb] py-24 md:py-28">
      <div className="landing-container">
        <div className="mx-auto max-w-[72rem]">
          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#8b6fd6]">
                <Terminal className="size-4" strokeWidth={2} aria-hidden="true" />
                Managed runtime
              </div>
              <h2 className="mt-5 max-w-[34rem] text-balance text-[clamp(2.8rem,5vw,4.2rem)] font-medium leading-[1.02] tracking-[-0.06em] text-[#5b5966]">
                Connect the agent.
                <br />
                Keep the boundary.
              </h2>
              <p className="mt-7 max-w-[31rem] text-pretty text-lg leading-8 text-[#6d6a73] sm:text-[1.25rem]">
                Omvra starts local provider sessions, attaches only the MCP access you enable, and keeps each project folder in its own project context.
              </p>
              <a
                href="https://github.com/lorddarq/omvra/blob/main/ACP_SETUP.md"
                className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#3b3b43] px-5 py-3 text-sm font-semibold text-white transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-[#2f2f36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f0eb]"
              >
                Read the setup guide
                <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] bg-[#282832] px-6 py-6 text-white shadow-[0_20px_50px_rgba(39,37,47,0.16)] sm:px-8 sm:py-8">
              <div className="absolute -right-16 -top-20 size-56 rounded-full bg-[#8b6fd6]/20 blur-3xl" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-center justify-between border-b border-white/10 pb-5 text-xs font-medium text-white/55">
                  <span>OMVRA / AGENT RUNTIME</span>
                  <span className="inline-flex items-center gap-2 text-emerald-300"><CircleDot className="size-3" aria-hidden="true" /> local</span>
                </div>
                <div className="mt-6 space-y-5">
                  {providers.map((provider) => (
                    <div key={provider.name} className="grid gap-4 border-b border-white/10 pb-5 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] sm:items-start">
                      <div className="flex items-center gap-3">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: provider.accent }} aria-hidden="true" />
                        <div>
                          <div className="font-medium text-white">{provider.name}</div>
                          <div className="mt-1 text-xs text-white/45">{provider.mode}</div>
                        </div>
                      </div>
                      <p className="text-sm leading-6 text-white/60">{provider.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 border-t border-white/10 pt-5 text-xs text-white/55">
                  <span className="inline-flex items-center gap-2"><ShieldCheck className="size-3.5 text-emerald-300" aria-hidden="true" /> Capability profiles</span>
                  <span className="inline-flex items-center gap-2"><RefreshCw className="size-3.5 text-[#d8bdff]" aria-hidden="true" /> Fresh session recovery</span>
                  <span className="inline-flex items-center gap-2"><Check className="size-3.5 text-[#f1c98c]" aria-hidden="true" /> Human review</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 grid gap-6 border-t border-black/10 pt-7 text-sm text-[#706b72] sm:grid-cols-3 sm:gap-8">
            <div><span className="font-semibold text-[#5b5966]">One profile</span><br />Executable, model, and provider options live together.</div>
            <div><span className="font-semibold text-[#5b5966]">One project context</span><br />Repository folders stay with projects and swimlanes.</div>
            <div><span className="font-semibold text-[#5b5966]">One clear handoff</span><br />Work returns to a person with activity and context intact.</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ACPSection
