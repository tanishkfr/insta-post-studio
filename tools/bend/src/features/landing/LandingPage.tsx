import { ArrowUpRight, ChevronRight, MoveUpRight } from "lucide-react";
import { SignalCanvas } from "../../components/SignalCanvas";
import { createGeneratedProject } from "../../engine/core/project";
import type { BendProject, MediaAssetRecord, SignalPresetId } from "../../engine/core/types";
import { getSignalPreset, SIGNAL_PRESETS } from "../../engine/generators/signalField";

interface LandingPageProps {
  onOpenStudio: () => void;
  onOpenExperiment: (project: BendProject, assets?: Record<string, MediaAssetRecord>, urls?: Record<string, string>) => void;
}

const CAPABILITIES = [
  ["Media", "Bring in footage and keep the source local."],
  ["Generate", "Build seeded motion from four live systems."],
  ["Effects", "Re-time, echo, slice, and displace a layer."],
  ["Animate", "Change values with keyframes or modulators."],
  ["Recipes", "Save a motion treatment for another project."],
] as const;

export function LandingPage({ onOpenStudio, onOpenExperiment }: LandingPageProps) {
  const openExperiment = (preset: SignalPresetId) => onOpenExperiment(createGeneratedProject("4:5", preset, `BEND-${preset.toUpperCase()}`));

  return (
    <main className="landing-page">
      <header className="site-nav page-gutter">
        <button className="wordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="BEND home">BEND<span>.</span></button>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#experiments">Explore</a>
          <a href="#about">About</a>
          <button className="nav-studio-link" onClick={onOpenStudio}>Open Studio <ArrowUpRight size={15} strokeWidth={1.8} /></button>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy page-gutter">
          <p className="eyebrow">LOCAL MOTION STUDIO / 001</p>
          <h1>Make motion<br /><em>misbehave.</em></h1>
          <p className="hero-description">BEND. is a browser-based instrument for footage, fields, and effects that refuse to sit still.</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={onOpenStudio}>Open Studio <ArrowUpRight size={17} /></button>
            <a className="text-link" href="#experiments">Explore experiments <ChevronRight size={16} /></a>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <SignalCanvas preset="pulse" seed="BEND-HERO" aspect="4:5" />
          <span className="hero-visual-label">SIGNAL FIELD / PLAYING</span>
          <span className="hero-visual-index">01—04</span>
        </div>
        <div className="hero-stamp" aria-hidden="true">PLAY<br />WITH<br />THE<br />UNEXPECTED</div>
      </section>

      <section className="statement-section page-gutter" id="about">
        <p className="eyebrow">THE PREMISE</p>
        <div className="statement-grid">
          <h2>A playground on the surface.<br /><span>A serious tool underneath.</span></h2>
          <div className="statement-detail">
            <p>Every frame is local. Every parameter is live. BEND. turns the distance between a thought and a moving image into something you can reach for.</p>
            <ul className="capability-list" aria-label="What BEND does">
              {CAPABILITIES.map(([label, description]) => <li key={label}><strong>{label}</strong><span>{description}</span></li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="experiments-section page-gutter" id="experiments">
        <div className="section-heading">
          <div>
            <p className="eyebrow">01 / EXPERIMENTS</p>
            <h2>Start with a signal.</h2>
          </div>
          <p className="section-note">Four deterministic fields.<br />No two gestures need to agree.</p>
        </div>
        <div className="experiment-grid">
          {SIGNAL_PRESETS.map((preset, index) => (
            <button className="experiment-tile" key={preset.id} onClick={() => openExperiment(preset.id)}>
              <SignalCanvas preset={preset.id} seed={`BEND-${preset.id}`} aspect="1:1" />
              <span className="experiment-meta"><span>0{index + 1}</span><strong>{preset.label}</strong><MoveUpRight size={15} /></span>
              <span className="sr-only">{getSignalPreset(preset.id).description}. Open in studio.</span>
            </button>
          ))}
        </div>
      </section>

      <section className="how-section page-gutter">
        <div className="section-heading">
          <div>
            <p className="eyebrow">02 / THE LOOP</p>
            <h2>Three ways in.<br />One moving image out.</h2>
          </div>
        </div>
        <div className="how-list">
          <article><span>01</span><div><h3>Upload footage</h3><p>Bring in a local MP4 or WebM. Nothing leaves the browser.</p></div><span className="how-arrow">↘</span></article>
          <article><span>02</span><div><h3>Generate motion</h3><p>Start from a seeded field and turn the dials until it catches.</p></div><span className="how-arrow">↘</span></article>
          <article><span>03</span><div><h3>Remix the material</h3><p>Push familiar footage through a live displacement effect.</p></div><span className="how-arrow">↘</span></article>
        </div>
      </section>

      <section className="landing-cta page-gutter">
        <div>
          <p className="eyebrow">03 / YOUR TURN</p>
          <h2>Make something<br /><em>slightly wrong.</em></h2>
        </div>
        <button className="button button-primary" onClick={onOpenStudio}>Open Studio <ArrowUpRight size={17} /></button>
      </section>

      <footer className="site-footer page-gutter">
        <div><button className="wordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>BEND<span>.</span></button><p>Make motion misbehave.</p></div>
        <div className="footer-links"><button onClick={onOpenStudio}>Open Studio</button><a href="#experiments">Experiments</a><a href="#about">About</a></div>
        <div className="footer-meta"><span>LOCAL PROCESSING / NO UPLOADS</span><span>© 2026 BEND.</span></div>
      </footer>
    </main>
  );
}

