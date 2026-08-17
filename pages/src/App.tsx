import Hero from './components/Hero'
import WhyOmvra from './components/WhyOmvra'
import ProductScreenshots from './components/ProductScreenshots'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import BestFor from './components/BestFor'
import PrivacyProof from './components/PrivacyProof'
import AgentPrompts from './components/AgentPrompts'
import ACPSection from './components/ACPSection'
import Download from './components/Download'
import Faq from './components/Faq'
import Footer from './components/Footer'

function App() {
  return (
    <div className="landing-shell">
      <Hero />
      <WhyOmvra />
      <ProductScreenshots />
      <Features />
      <HowItWorks />
      <BestFor />
      <PrivacyProof />
      <AgentPrompts />
      <ACPSection />
      <Download />
      <Faq />
      <Footer />
    </div>
  )
}

export default App
