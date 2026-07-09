import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Volume2, Sparkles, Activity, Plus, Minus } from 'lucide-react';
import { MetronomeEngine, MetronomeSoundType, SubdivisionType } from '../services/MetronomeEngine';

interface MetronomeControllerProps {
  engine: MetronomeEngine;
  onBpmChange?: (bpm: number) => void;
  onTimeSignatureChange?: (num: number) => void;
}

export const MetronomeController: React.FC<MetronomeControllerProps> = ({
  engine,
  onBpmChange,
  onTimeSignatureChange,
}) => {
  const [bpm, setBpm] = useState<number>(engine.getBpm());
  const [isPlaying, setIsPlaying] = useState<boolean>(engine.getIsRunning());
  const [beatsPerMeasure, setBeatsPerMeasure] = useState<number>(4);
  const [subdivision, setSubdivision] = useState<SubdivisionType>('quarter');
  const [soundType, setSoundType] = useState<MetronomeSoundType>('woodblock');
  const [accentFirstBeat, setAccentFirstBeat] = useState<boolean>(true);
  const [vibrationEnabled, setVibrationEnabled] = useState<boolean>(false);

  // Pour le Tap Tempo
  const tapTimes = useRef<number[]>([]);

  // Pour les animations visuelles (Flash)
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const [isFlashActive, setIsFlashActive] = useState<boolean>(false);

  useEffect(() => {
    // Mettre à jour l'état si le métronome tourne déjà (ex: lancé depuis le mode scène)
    const interval = setInterval(() => {
      setIsPlaying(engine.getIsRunning());
      setBpm(engine.getBpm());
    }, 200);

    // Configurer le callback du tick du métronome
    engine.setCallbacks((tickInfo) => {
      setCurrentBeat(tickInfo.beatNumber);
      if (tickInfo.subdivisionIndex === 0) {
        setIsFlashActive(true);
        setTimeout(() => setIsFlashActive(false), 80);
      }
    });

    return () => {
      clearInterval(interval);
    };
  }, [engine]);

  // Synchronisation des changements avec le moteur
  useEffect(() => {
    engine.setBpm(bpm);
    if (onBpmChange) onBpmChange(bpm);
  }, [bpm, engine, onBpmChange]);

  useEffect(() => {
    engine.setSignature(beatsPerMeasure);
    if (onTimeSignatureChange) onTimeSignatureChange(beatsPerMeasure);
  }, [beatsPerMeasure, engine, onTimeSignatureChange]);

  useEffect(() => {
    engine.setSubdivision(subdivision);
  }, [subdivision, engine]);

  useEffect(() => {
    engine.setSoundType(soundType);
  }, [soundType, engine]);

  useEffect(() => {
    engine.setAccentFirstBeat(accentFirstBeat);
  }, [accentFirstBeat, engine]);

  useEffect(() => {
    engine.setVibrationEnabled(vibrationEnabled);
  }, [vibrationEnabled, engine]);

  // Gérer le play / stop
  const togglePlay = () => {
    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
      setCurrentBeat(0);
    } else {
      engine.start();
      setIsPlaying(true);
    }
  };

  // Calcul du Tap Tempo
  const handleTap = () => {
    const now = Date.now();
    tapTimes.current.push(now);

    // Garder seulement les 5 derniers taps
    if (tapTimes.current.length > 5) {
      tapTimes.current.shift();
    }

    if (tapTimes.current.length > 1) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimes.current.length; i++) {
        intervals.push(tapTimes.current[i] - tapTimes.current[i - 1]);
      }
      // Calculer l'intervalle moyen
      const averageInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      
      // Convertir intervalle (ms) en BPM
      const calculatedBpm = Math.round(60000 / averageInterval);
      
      if (calculatedBpm >= 30 && calculatedBpm <= 300) {
        setBpm(calculatedBpm);
      }
    }
  };

  // Réinitialiser les taps après 2.5 secondes d'inactivité
  useEffect(() => {
    const handleResetTap = () => {
      const lastTap = tapTimes.current[tapTimes.current.length - 1];
      if (lastTap && Date.now() - lastTap > 2500) {
        tapTimes.current = [];
      }
    };
    const interval = setInterval(handleResetTap, 1000);
    return () => clearInterval(interval);
  }, []);

  const adjustBpm = (amount: number) => {
    setBpm((prev) => Math.max(30, Math.min(300, prev + amount)));
  };

  return (
    <div className="glass-panel rounded-2xl p-6 glow-emerald/5 transition-all">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Visuel du Tempo (Flash & Compteur) */}
        <div className="flex flex-col items-center gap-3 w-full md:w-auto">
          <div className="relative flex items-center justify-center w-28 h-28 rounded-full border-2 border-zinc-800 bg-zinc-900/50">
            {/* Anneau de pulsation */}
            <div className={`absolute inset-0 rounded-full transition-all duration-75 ${
              isFlashActive 
                ? (currentBeat === 1 && accentFirstBeat ? 'bg-emerald-500/20 scale-110 border-emerald-500' : 'bg-zinc-100/10 scale-105 border-zinc-500') 
                : 'opacity-0 scale-95'
            }`} />
            
            <div className="text-center z-10">
              <span className={`text-4xl font-extrabold transition-all duration-75 ${
                isFlashActive 
                  ? (currentBeat === 1 && accentFirstBeat ? 'text-emerald-400' : 'text-zinc-100') 
                  : 'text-zinc-500'
              }`}>
                {isPlaying ? currentBeat : '-'}
              </span>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mt-1">Temps</p>
            </div>
          </div>
          
          <div className="flex gap-2 mt-1">
            {Array.from({ length: beatsPerMeasure }).map((_, idx) => (
              <div 
                key={idx}
                className={`w-3 h-3 rounded-full transition-all duration-100 ${
                  currentBeat === idx + 1 && isPlaying
                    ? (idx === 0 && accentFirstBeat ? 'bg-emerald-400 scale-125 shadow-emerald-500/50 shadow-sm' : 'bg-zinc-300 scale-110')
                    : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Contrôleur central du BPM */}
        <div className="flex-1 text-center w-full">
          <div className="flex items-center justify-center gap-4">
            <button 
              onClick={() => adjustBpm(-5)} 
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Minus size={20} />
            </button>
            
            <div className="flex flex-col items-center select-none">
              <input 
                type="number" 
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-28 text-5xl font-black text-center bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none text-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-zinc-500 font-semibold tracking-wider uppercase mt-1">BPM</span>
            </div>

            <button 
              onClick={() => adjustBpm(5)} 
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="flex justify-center gap-2 mt-4">
            <button 
              onClick={() => adjustBpm(-1)}
              className="px-3 py-1 rounded-lg text-xs bg-zinc-900/60 border border-zinc-800/80 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-all"
            >
              -1
            </button>
            <button 
              onClick={handleTap}
              className="px-6 py-1.5 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 font-bold active:bg-emerald-500/20 transition-all uppercase tracking-wide flex items-center gap-1.5"
            >
              <Activity size={14} /> Tap Tempo
            </button>
            <button 
              onClick={() => adjustBpm(1)}
              className="px-3 py-1 rounded-lg text-xs bg-zinc-900/60 border border-zinc-800/80 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-all"
            >
              +1
            </button>
          </div>
        </div>

        {/* Contrôles et paramètres */}
        <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
          {/* Signature */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500 font-medium">Signature</label>
            <select 
              value={beatsPerMeasure} 
              onChange={(e) => setBeatsPerMeasure(Number(e.target.value))}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-zinc-300"
            >
              <option value={2}>2 / Temps (2/4)</option>
              <option value={3}>3 / Temps (3/4)</option>
              <option value={4}>4 / Temps (4/4)</option>
              <option value={5}>5 / Temps (5/4)</option>
              <option value={6}>6 / Temps (6/8)</option>
              <option value={7}>7 / Temps (7/8)</option>
              <option value={8}>8 / Temps (8/8)</option>
            </select>
          </div>

          {/* Subdivision */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500 font-medium">Subdivision</label>
            <select 
              value={subdivision} 
              onChange={(e) => setSubdivision(e.target.value as SubdivisionType)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-zinc-300"
            >
              <option value="quarter">Noires (1x)</option>
              <option value="eighth">Croches (2x)</option>
              <option value="triplet">Triolets (3x)</option>
              <option value="sixteenth">Double croches (4x)</option>
            </select>
          </div>

          {/* Son */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500 font-medium">Son</label>
            <select 
              value={soundType} 
              onChange={(e) => setSoundType(e.target.value as MetronomeSoundType)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-zinc-300"
            >
              <option value="woodblock">Woodblock</option>
              <option value="cowbell">Cowbell (Cloche)</option>
              <option value="synth">Synthé Bip</option>
            </select>
          </div>

          {/* Options (Accents / Haptiques) */}
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400 select-none">
              <input 
                type="checkbox" 
                checked={accentFirstBeat}
                onChange={(e) => setAccentFirstBeat(e.target.checked)}
                className="accent-emerald-500 rounded border-zinc-800 bg-zinc-900"
              />
              Accentuer le 1er temps
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400 select-none">
              <input 
                type="checkbox" 
                checked={vibrationEnabled}
                onChange={(e) => setVibrationEnabled(e.target.checked)}
                className="accent-emerald-500 rounded border-zinc-800 bg-zinc-900"
              />
              Vibrations (Haptique)
            </label>
          </div>
        </div>

      </div>

      {/* Grand Bouton Play/Pause */}
      <div className="mt-6">
        <button 
          onClick={togglePlay}
          className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-lg uppercase tracking-wider transition-all duration-300 ${
            isPlaying 
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 shadow-lg glow-rose/10' 
              : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-lg glow-emerald/10'
          }`}
        >
          {isPlaying ? (
            <>
              <Square size={20} fill="currentColor" /> Arrêter le métronome
            </>
          ) : (
            <>
              <Play size={20} fill="currentColor" /> Lancer le métronome
            </>
          )}
        </button>
      </div>

    </div>
  );
};
