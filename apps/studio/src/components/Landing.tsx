import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

type LandingTool = "image" | "vector" | "typography" | "shapes" | "bend" | "generate";
const tools: { id: LandingTool; name: string; icon: ReactNode }[] = [
  { id: "image", name: "Image", icon: <><path d="M8 9h4l2-3h5l2 3h3a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3Z" /><circle cx="16" cy="17" r="4" /></> },
  { id: "vector", name: "Vector", icon: <><path d="M7 24 16 6l9 18-9-5z" /><circle cx="7" cy="24" r="2" /><circle cx="16" cy="6" r="2" /><circle cx="25" cy="24" r="2" /></> },
  { id: "typography", name: "Type", icon: <><path d="M6 8h20M16 8v17M11 25h10" /></> },
  { id: "shapes", name: "Shapes", icon: <><path d="m16 4 10 6v12l-10 6-10-6V10zM6 10l10 6 10-6M16 16v12" /></> },
  { id: "bend", name: "Video", icon: <><rect x="4" y="7" width="24" height="18" rx="3" /><path d="m14 12 7 4-7 4z" /></> },
  { id: "generate", name: "Generate", icon: <><path d="M16 4c1 7 4 10 11 12-7 2-10 5-11 12-2-7-5-10-12-12 7-2 10-5 12-12z" /></> },
];

export function Landing({ onEnter, onOpenTool }: { onEnter: () => void; onOpenTool: (tool: LandingTool) => void }) {
  const [rotation, setRotation] = useState(0);
  const drag = useRef<{ x: number; last: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const musicTimer = useRef<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  function stopSound() {
    if (musicTimer.current !== null) window.clearInterval(musicTimer.current);
    musicTimer.current = null;
    const context = audio.current;
    audio.current = null;
    if (context) void context.close();
  }

  useEffect(() => () => stopSound(), []);

  async function toggleSound() {
    if (audio.current) { stopSound(); setSoundOn(false); return; }
    const context = new AudioContext();
    audio.current = context;
    await context.resume();
    setSoundOn(true);
    const notes = [220, 277.18, 329.63, 415.3, 329.63, 277.18];
    let index = 0;
    const playNote = () => {
      if (context.state !== "running") return;
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.value = notes[index++ % notes.length];
      volume.gain.setValueAtTime(0, now);
      volume.gain.linearRampToValueAtTime(0.025, now + 0.5);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
      oscillator.connect(volume).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 3.6);
    };
    playNote();
    musicTimer.current = window.setInterval(playNote, 2200);
  }

  function playBreeze() {
    const context = audio.current;
    if (!context || context.state !== "running") return;
    const length = Math.floor(context.sampleRate * 0.7);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const volume = context.createGain();
    const now = context.currentTime;
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.linearRampToValueAtTime(1200, now + 0.35);
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.linearRampToValueAtTime(0.025, now + 0.2);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    source.connect(filter).connect(volume).connect(context.destination);
    source.start(now);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    if (Math.abs(event.clientX - state.x) > 5) {
      if (!state.moved) playBreeze();
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (state.moved) setRotation((angle) => angle + (event.clientX - state.last) * 0.008);
    state.last = event.clientX;
  }

  return (
    <main className="landing cat-landing">
      <header className="landing-header">
        <div className="landing-brand">STUDIO <span>2.0</span></div>
        <div className="landing-header-actions"><button type="button" className="landing-header-link sound-toggle" aria-pressed={soundOn} onClick={() => void toggleSound()}>{soundOn ? "Sound on" : "Sound off"}</button><button type="button" className="landing-header-link" onClick={onEnter}>Open your workspace <span aria-hidden="true">↗</span></button></div>
      </header>
      <section className="cat-hero" aria-labelledby="landing-title">
        <div className="cat-copy">
          <h1 id="landing-title">Less stress.<br />More creativity.</h1>
          <p>A toolset to create social media posts effortlessly.</p>
          <button type="button" className="landing-enter" onClick={onEnter}>Enter Studio <span aria-hidden="true">↗</span></button>
        </div>
        <div className="tool-orbit" aria-label="Explore Studio tools" onPointerDown={(event) => { drag.current = { x: event.clientX, last: event.clientX, moved: false }; suppressClick.current = false; }} onPointerMove={move} onPointerUp={() => { suppressClick.current = Boolean(drag.current?.moved); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onWheel={(event) => { const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0); if (delta) setRotation((angle) => angle + delta * 0.006); }}>
          {tools.map((tool, index) => {
            const angle = rotation + index * Math.PI / 3;
            return <button key={tool.id} type="button" className="orbit-tool" aria-label={`Open ${tool.name}`} style={{ left: `${50 + Math.cos(angle) * 43}%`, top: `${50 + Math.sin(angle) * 38}%`, zIndex: Math.sin(angle) > 0 ? 3 : 2 }} onClick={() => { if (!suppressClick.current) onOpenTool(tool.id); suppressClick.current = false; }}>
              <span className="orbit-tool-face"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tool.icon}</svg><span>{tool.name}</span></span>
            </button>;
          })}
        </div>
        <div className="orbit-controls"><button type="button" aria-label="Rotate tools left" onClick={() => setRotation((value) => value - Math.PI / 3)}>←</button><span>Drag to explore</span><button type="button" aria-label="Rotate tools right" onClick={() => setRotation((value) => value + Math.PI / 3)}>→</button></div>
      </section>
    </main>
  );
}
