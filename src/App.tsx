import { useEffect, useRef, useState } from 'react';
import { PatternData, FxData, DEFAULT_FX, PRESETS, emptyPattern } from './data/presets';
import { TB303Engine } from './audio/engine';
import { PresetBar } from './components/PresetBar';
import { StepGrid } from './components/StepGrid';
import { Controls } from './components/Controls';
import { FxControls } from './components/FxControls';
import './App.css';

export default function App() {
  const [pattern, setPattern] = useState<PatternData>(() => ({
    ...PRESETS[0],
    steps: PRESETS[0].steps.map(s => ({ ...s })),
  }));
  const [fxData, setFxData] = useState<FxData>(() => ({ ...DEFAULT_FX }));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);

  const engineRef = useRef<TB303Engine | null>(null);

  useEffect(() => {
    engineRef.current?.setPattern(pattern);
  }, [pattern]);

  useEffect(() => {
    engineRef.current?.setFx(fxData);
  }, [fxData]);

  const getOrCreateEngine = () => {
    if (!engineRef.current) {
      const engine = new TB303Engine(pattern, fxData);
      engine.setOnStep(step => setCurrentStep(step));
      engineRef.current = engine;
    }
    return engineRef.current;
  };

  const handlePreviewNote = (midi: number) => {
    getOrCreateEngine().previewNote(midi);
  };

  const handleTogglePlay = async () => {
    if (isPlaying) {
      engineRef.current?.stop();
      setIsPlaying(false);
      setCurrentStep(-1);
    } else {
      const engine = getOrCreateEngine();
      engine.setOnStep(step => setCurrentStep(step));
      await engine.start();
      setIsPlaying(true);
    }
  };

  const handlePreset = (p: PatternData) => {
    setPattern(p);
    if (isPlaying) engineRef.current?.setPattern(p);
  };

  const handleNew = () => setPattern(emptyPattern());

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">TB-303 SIMULATOR</h1>
      </header>

      <PresetBar current={pattern} onSelect={handlePreset} />

      <main className="app-main">
        <StepGrid
          pattern={pattern}
          currentStep={currentStep}
          onChange={setPattern}
          onPreviewNote={handlePreviewNote}
        />
        <div className="bottom-row">
          <Controls
            pattern={pattern}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onChange={setPattern}
          />
          <button className="new-btn" onClick={handleNew}>NEW PATTERN</button>
        </div>
        <FxControls fx={fxData} onChange={setFxData} />
      </main>
    </div>
  );
}
