import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Square, AlertCircle, RefreshCw, Sun, Lightbulb } from 'lucide-react';
import { Song } from '../db/database';
import { MetronomeEngine } from '../services/MetronomeEngine';
import { KeepAwake } from '@capacitor-community/keep-awake';

interface SceneModeViewProps {
  engine: MetronomeEngine;
  songIds: number[]; // Liste des IDs des morceaux de la setlist
  songsList: Song[]; // Tous les morceaux chargés
  setlistTitle?: string;
  onExit: () => void;
}

interface StructureBlock {
  name: string;
  measures: string;
  colorClass: string;
}

export const SceneModeView: React.FC<SceneModeViewProps> = ({
  engine,
  songIds,
  songsList,
  setlistTitle = "Live Mode",
  onExit,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  
  // États de lecture
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const [isFlashActive, setIsFlashActive] = useState<boolean>(false);
  
  // Compte à rebours
  const [countdownActive, setCountdownActive] = useState<boolean>(false);
  const [countdownBeats, setCountdownBeats] = useState<number>(4);
  
  // Options
  const [visualFlashEnabled, setVisualFlashEnabled] = useState<boolean>(true);
  const [vibrationEnabled, setVibrationEnabled] = useState<boolean>(false);
  
  // Wake lock ref
  const wakeLockRef = useRef<any>(null);

  // Charger le morceau actuel
  useEffect(() => {
    if (songIds.length > 0 && currentIndex >= 0 && currentIndex < songIds.length) {
      const songId = songIds[currentIndex];
      const song = songsList.find(s => s.id === songId);
      if (song) {
        setCurrentSong(song);
        // Configurer le métronome
        engine.stop();
        setIsPlaying(false);
        setCountdownActive(false);
        engine.setBpm(song.bpm);
        
        // Extraire la signature rythmique (ex: "4/4" -> numérateur 4)
        const numerator = parseInt(song.timeSignature.split('/')[0]) || 4;
        engine.setSignature(numerator);
        engine.setSubdivision('quarter');
      }
    }
  }, [currentIndex, songIds, songsList, engine]);

  // Activer le KeepAwake (Empêcher la mise en veille)
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        // Option 1 : Via le plugin Capacitor
        await KeepAwake.keepAwake();
      } catch (e) {
        // Option 2 : Via l'API Web standard de WakeLock (Secours navigateur)
        try {
          if ('wakeLock' in navigator) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          }
        } catch (err) {
          console.warn("Impossible d'activer le Wake Lock de l'écran", err);
        }
      }
    };

    const releaseWakeLock = async () => {
      try {
        await KeepAwake.allowSleep();
      } catch (e) {}
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (e) {}
      }
    };

    requestWakeLock();

    return () => {
      releaseWakeLock();
    };
  }, []);

  // Écouter les ticks du métronome
  useEffect(() => {
    engine.setCallbacks(
      (tickInfo) => {
        setCurrentBeat(tickInfo.beatNumber);
        if (tickInfo.subdivisionIndex === 0 && visualFlashEnabled) {
          setIsFlashActive(true);
          setTimeout(() => setIsFlashActive(false), 80);
        }
      },
      (progress) => {
        // Callback du compte à rebours
        setCountdownBeats(progress);
      },
      () => {
        // Fin du compte à rebours, début du métronome principal
        setCountdownActive(false);
      }
    );

    // Vérifier régulièrement si le moteur est lancé
    const interval = setInterval(() => {
      setIsPlaying(engine.getIsRunning());
      setCountdownActive(engine.getIsCountingDown());
    }, 150);

    return () => {
      clearInterval(interval);
    };
  }, [engine, visualFlashEnabled]);

  // Appliquer les options au moteur
  useEffect(() => {
    engine.setVisualFlashEnabled(visualFlashEnabled);
    engine.setVibrationEnabled(vibrationEnabled);
  }, [visualFlashEnabled, vibrationEnabled, engine]);

  if (!currentSong) {
    return (
      <div className="bg-black text-white h-screen flex flex-col items-center justify-center">
        <p className="text-zinc-500">Aucun morceau disponible</p>
        <button onClick={onExit} className="mt-4 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded">Quitter</button>
      </div>
    );
  }

  // Parseur de structure
  const parseStructure = (structStr?: string): StructureBlock[] => {
    if (!structStr) return [];
    
    // Découper sur le tiret ou la virgule
    const blocks = structStr.split(/[-,\r\n]+/).map(b => b.trim()).filter(b => b !== '');
    
    return blocks.map(block => {
      const match = block.match(/^([A-Za-zÀ-ÿ\s]+)(?:\[(\d+)\])?$/);
      const name = match ? match[1].trim() : block;
      const measures = match && match[2] ? match[2] : '';
      
      // Assigner des couleurs stylées selon le nom
      let colorClass = 'bg-zinc-800 border-zinc-700 text-zinc-300';
      const nameLower = name.toLowerCase();
      
      if (nameLower.includes('intro') || nameLower.includes('départ')) {
        colorClass = 'bg-blue-950/80 border-blue-800/80 text-blue-300';
      } else if (nameLower.includes('couplet') || nameLower.includes('verse')) {
        colorClass = 'bg-emerald-950/80 border-emerald-800/80 text-emerald-300';
      } else if (nameLower.includes('refrain') || nameLower.includes('chorus')) {
        colorClass = 'bg-rose-950/80 border-rose-800/80 text-rose-300';
      } else if (nameLower.includes('solo')) {
        colorClass = 'bg-amber-950/80 border-amber-800/80 text-amber-300';
      } else if (nameLower.includes('pont') || nameLower.includes('bridge')) {
        colorClass = 'bg-purple-950/80 border-purple-800/80 text-purple-300';
      } else if (nameLower.includes('outro') || nameLower.includes('fin')) {
        colorClass = 'bg-zinc-900 border-zinc-700 text-zinc-400';
      }
      
      return { name, measures, colorClass };
    });
  };

  const structureBlocks = parseStructure(currentSong.structure);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < songIds.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleTogglePlay = (withCountdown: boolean = false) => {
    if (isPlaying || countdownActive) {
      engine.stop();
      setIsPlaying(false);
      setCountdownActive(false);
      setCurrentBeat(0);
    } else {
      if (withCountdown) {
        setCountdownActive(true);
        // Obtenir le numérateur de la signature pour le compte à rebours
        const num = parseInt(currentSong.timeSignature.split('/')[0]) || 4;
        engine.start(true, num);
      } else {
        engine.start();
      }
      setIsPlaying(true);
    }
  };

  return (
    <div className={`h-screen bg-black text-white flex flex-col justify-between overflow-hidden transition-all duration-75 relative select-none ${
      isFlashActive 
        ? (currentBeat === 1 ? 'bg-emerald-950/50' : 'bg-zinc-900/30') 
        : ''
    }`}>
      
      {/* BARRE HAUTE - Contrôles et Navigation globale */}
      <header className="p-4 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-md z-10">
        <div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Concert : {setlistTitle}</span>
          <span className="text-xs text-emerald-400 font-bold block mt-0.5">
            Morceau {currentIndex + 1} sur {songIds.length}
          </span>
        </div>

        {/* Options à bascule rapide */}
        <div className="flex gap-4">
          <button 
            onClick={() => setVisualFlashEnabled(!visualFlashEnabled)}
            className={`p-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              visualFlashEnabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'border-zinc-800 text-zinc-500'
            }`}
          >
            <Sun size={14} /> Flash
          </button>
          <button 
            onClick={() => setVibrationEnabled(!vibrationEnabled)}
            className={`p-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              vibrationEnabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'border-zinc-800 text-zinc-500'
            }`}
          >
            <Lightbulb size={14} /> Vibrer
          </button>
          <button 
            onClick={() => { engine.stop(); onExit(); }}
            className="px-3.5 py-2 bg-zinc-900 border border-zinc-800 hover:border-rose-900/40 hover:text-rose-400 text-zinc-400 text-xs font-bold rounded-lg cursor-pointer transition-colors"
          >
            Quitter le Live
          </button>
        </div>
      </header>

      {/* CONTENU PRINCIPAL - Gros caractères */}
      <main className="flex-1 flex flex-col justify-around px-6 py-4 overflow-y-auto">
        
        {/* Info Chanson */}
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white line-clamp-1">{currentSong.title}</h1>
          <p className="text-lg md:text-2xl text-zinc-400 font-semibold mt-1.5">{currentSong.artist}</p>
        </div>

        {/* SECTION METRONOME & TEMPO GÉANT */}
        <div className="flex flex-col items-center justify-center my-4">
          {countdownActive ? (
            <div className="flex flex-col items-center animate-pulse">
              <span className="text-9xl font-black text-rose-500">{countdownBeats}</span>
              <p className="text-sm text-rose-400 uppercase tracking-widest font-black mt-2">Compte à rebours</p>
            </div>
          ) : (
            <div className="flex items-baseline justify-center gap-4">
              <span className="text-9xl md:text-[14rem] font-black text-emerald-400 leading-none tracking-tighter">
                {currentSong.bpm}
              </span>
              <div className="flex flex-col">
                <span className="text-xl md:text-3xl font-black text-zinc-500 border border-zinc-800 bg-zinc-950/80 px-3 py-1 rounded-xl">
                  {currentSong.timeSignature}
                </span>
                {currentSong.key && (
                  <span className="text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-widest mt-1 text-center bg-zinc-900 px-2 py-0.5 rounded">
                    {currentSong.key}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Indicateur de battement visuel (Gros points de temps) */}
          <div className="flex gap-4 mt-6">
            {Array.from({ length: parseInt(currentSong.timeSignature.split('/')[0]) || 4 }).map((_, idx) => (
              <div 
                key={idx}
                className={`w-5 h-5 rounded-full transition-all duration-100 ${
                  currentBeat === idx + 1 && isPlaying && !countdownActive
                    ? (idx === 0 ? 'bg-emerald-400 scale-130 shadow-lg shadow-emerald-500/50' : 'bg-white scale-120')
                    : 'bg-zinc-900 border border-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* STRUCTURE DU MORCEAU (Frise de briques) */}
        {structureBlocks.length > 0 && (
          <div className="w-full max-w-4xl mx-auto flex flex-col gap-2 bg-zinc-950/40 p-3 rounded-2xl border border-zinc-900/60">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Structure du morceau</span>
            <div className="flex flex-wrap gap-2">
              {structureBlocks.map((block, idx) => (
                <div 
                  key={idx}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 shadow-sm ${block.colorClass}`}
                >
                  <span>{block.name}</span>
                  {block.measures && (
                    <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/5 text-[10px] font-black">
                      {block.measures}m
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NOTES ET COMMENTAIRES CRITIQUES */}
        {currentSong.comments && (
          <div className="w-full max-w-4xl mx-auto p-4 bg-zinc-950/80 border border-zinc-900 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Notes Batteristes</span>
              <p className="text-zinc-200 text-sm md:text-base font-semibold leading-relaxed">
                {currentSong.comments}
              </p>
            </div>
          </div>
        )}

      </main>

      {/* BARRE BASSE - Contrôles de scène */}
      <footer className="p-6 border-t border-zinc-900 bg-zinc-950/90 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4 z-10">
        
        {/* Navigation morceaux */}
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="flex-1 md:flex-initial px-4 py-3 bg-zinc-900 border border-zinc-800 disabled:opacity-30 disabled:hover:bg-zinc-900 font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ChevronLeft size={20} /> Précédent
          </button>
          
          <button 
            onClick={handleNext}
            disabled={currentIndex === songIds.length - 1}
            className="flex-1 md:flex-initial px-4 py-3 bg-zinc-900 border border-zinc-800 disabled:opacity-30 disabled:hover:bg-zinc-900 font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Suivant <ChevronRight size={20} />
          </button>
        </div>

        {/* Contrôles du tempo */}
        <div className="flex gap-3 w-full md:w-auto flex-1 justify-end">
          
          {/* Lancement avec Compte à rebours */}
          <button 
            onClick={() => handleTogglePlay(true)}
            className={`flex-1 md:flex-initial px-6 py-3.5 rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 border transition-all ${
              isPlaying || countdownActive
                ? 'bg-rose-950/20 border-rose-900/40 text-rose-400 hover:bg-rose-500/20'
                : 'bg-zinc-900 border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-white'
            }`}
          >
            <RefreshCw size={18} className={countdownActive ? 'animate-spin' : ''} /> 
            {isPlaying || countdownActive ? 'Stop' : 'Count & Go'}
          </button>

          {/* Lancement immédiat */}
          <button 
            onClick={() => handleTogglePlay(false)}
            className={`flex-1 md:flex-initial px-8 py-3.5 rounded-xl font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
              isPlaying && !countdownActive
                ? 'bg-rose-600 hover:bg-rose-500 text-zinc-100 shadow-md shadow-rose-950/20'
                : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md shadow-emerald-950/20'
            }`}
          >
            {isPlaying && !countdownActive ? (
              <>
                <Square size={18} fill="currentColor" /> Stop
              </>
            ) : (
              <>
                <Play size={18} fill="currentColor" /> Start Live
              </>
            )}
          </button>

        </div>

      </footer>

    </div>
  );
};
