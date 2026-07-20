import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Play, Square, AlertCircle, RefreshCw, Sun, Lightbulb, Settings, Trash2, Volume2, Upload } from 'lucide-react';
import { Song, db } from '../db/database';
import { MetronomeEngine } from '../services/MetronomeEngine';
import { KeepAwake } from '@capacitor-community/keep-awake';

interface SceneModeViewProps {
  engine: MetronomeEngine;
  songIds: number[]; // Liste des IDs des morceaux de la setlist
  songsList: Song[]; // Tous les morceaux chargés
  setlistTitle?: string;
  defaultFlashColor?: string;
  defaultFlashColorWeak?: string;
  defaultCountdownBeats?: number;
  defaultAccentFirstBeat?: boolean;
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
  defaultFlashColor = "emerald",
  defaultFlashColorWeak = "none",
  defaultCountdownBeats = 4,
  defaultAccentFirstBeat = true,
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
  
  // Personnalisations utilisateur
  const [flashColor, setFlashColor] = useState<string>(defaultFlashColor); // 'emerald', 'amber', 'rose', 'blue', 'white'
  const [flashColorWeak, setFlashColorWeak] = useState<string>(defaultFlashColorWeak); // 'none', 'emerald', 'amber', 'rose', 'blue', 'white'
  const [accentFirstBeat, setAccentFirstBeat] = useState<boolean>(defaultAccentFirstBeat);
  const [customCountdownBeats, setCustomCountdownBeats] = useState<number>(defaultCountdownBeats);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showLeftRipple, setShowLeftRipple] = useState<boolean>(false);
  const [showRightRipple, setShowRightRipple] = useState<boolean>(false);

  // Banque de sons et Assignations locales au live
  const [customSounds, setCustomSounds] = useState<any[]>([]);
  const [beatSounds, setBeatSounds] = useState<string[]>(() => {
    const saved = localStorage.getItem('beatSounds');
    return saved ? JSON.parse(saved) : ['woodblock-high', 'woodblock-low', 'woodblock-low', 'woodblock-low'];
  });

  // Charger les sons de la base
  const loadCustomSounds = async () => {
    try {
      const sounds = await db.customSounds.toArray();
      setCustomSounds(sounds);
    } catch (err) {
      console.error("Erreur de chargement des sons :", err);
    }
  };

  useEffect(() => {
    if (showSettingsModal) {
      loadCustomSounds();
    }
  }, [showSettingsModal]);

  // Synchroniser les sons avec le moteur local
  useEffect(() => {
    engine.setBeatSounds(beatSounds);
    localStorage.setItem('beatSounds', JSON.stringify(beatSounds));
  }, [beatSounds, engine]);
  
  // Wake lock ref
  const wakeLockRef = useRef<any>(null);

  // Filtrer les songIds orphelins (qui n'existent pas dans songsList)
  const validSongIds = useMemo(() => {
    return songIds.filter(songId => 
      songsList.some(s => String(s.id) === String(songId))
    );
  }, [songIds, songsList]);

  useEffect(() => {
    if (validSongIds.length > 0 && currentIndex >= 0 && currentIndex < validSongIds.length) {
      const songId = validSongIds[currentIndex];
      const song = songsList.find(s => String(s.id) === String(songId));
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
  }, [currentIndex, validSongIds, songsList, engine]);

  // Appliquer l'accentuation du premier temps
  useEffect(() => {
    engine.setAccentFirstBeat(accentFirstBeat);
  }, [accentFirstBeat, engine]);

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
      <div className="bg-black text-white h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-zinc-400 font-bold">Aucun morceau disponible dans le Mode Live</p>
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 text-left text-xs font-mono max-w-lg mt-4 flex flex-col gap-2">
          <div><strong>Setlist :</strong> {setlistTitle}</div>
          <div><strong>Index actuel :</strong> {currentIndex}</div>
          <div><strong>songIds (Concert) :</strong> {JSON.stringify(songIds)}</div>
          <div><strong>songsList (Bibliothèque reçue) :</strong> {JSON.stringify(songsList.map(s => ({ id: s.id, title: s.title })))}</div>
          <div><strong>Chanson cherchée (ID) :</strong> {songIds[currentIndex]}</div>
        </div>
        <button onClick={onExit} className="mt-6 px-6 py-2.5 bg-emerald-500 text-zinc-950 font-bold rounded-xl cursor-pointer">Quitter le Live</button>
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
      setShowLeftRipple(true);
      setTimeout(() => setShowLeftRipple(false), 400);
    }
  };

  const handleNext = () => {
    if (currentIndex < validSongIds.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowRightRipple(true);
      setTimeout(() => setShowRightRipple(false), 400);
    }
  };

  const getFlashBgClass = () => {
    if (!isFlashActive) return '';
    if (currentBeat === 1) {
      switch (flashColor) {
        case 'amber': return 'bg-amber-500/85';
        case 'rose': return 'bg-rose-600/90';
        case 'blue': return 'bg-blue-600/90';
        case 'white': return 'bg-white/95';
        case 'emerald':
        default:
          return 'bg-emerald-500/85';
      }
    } else if (flashColorWeak !== 'none') {
      switch (flashColorWeak) {
        case 'amber': return 'bg-amber-500/35';
        case 'rose': return 'bg-rose-600/35';
        case 'blue': return 'bg-blue-600/35';
        case 'white': return 'bg-white/40';
        case 'emerald':
        default:
          return 'bg-emerald-500/35';
      }
    }
    return 'bg-zinc-900/10';
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
        setCountdownBeats(customCountdownBeats);
        engine.start(true, customCountdownBeats);
      } else {
        engine.start();
      }
      setIsPlaying(true);
    }
  };

  return (
    <div className={`h-screen bg-black text-white flex flex-col justify-between overflow-hidden transition-all duration-75 relative select-none ${getFlashBgClass()}`}>
      
      {/* BARRE HAUTE - Contrôles et Navigation globale */}
      <header className="p-4 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-md z-10">
        <div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Concert en cours</span>
          <span className="text-xs text-zinc-400 font-bold block mt-0.5">{setlistTitle}</span>
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
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 text-zinc-400 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            title="Paramètres de Scène"
          >
            <Settings size={14} /> Options
          </button>
          <button 
            onClick={() => { engine.stop(); onExit(); }}
            className="px-3.5 py-2 bg-zinc-900 border border-zinc-800 hover:border-rose-900/40 hover:text-rose-400 text-zinc-400 text-xs font-bold rounded-lg cursor-pointer transition-colors"
          >
            Quitter le Live
          </button>
        </div>
      </header>

      {/* ZONE CENTRALE AVEC NAVIGATION EN SUPERPOSITION (OVERLAY) */}
      <div className="flex-1 flex flex-row items-center justify-between relative px-0 overflow-hidden">
        
        {/* Bouton Précédent Géant à gauche (en superposition invisible) */}
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="absolute left-0 top-0 bottom-0 w-20 md:w-28 bg-transparent disabled:pointer-events-none z-20 focus:outline-none transition-all duration-200 cursor-pointer shrink-0 active:bg-white/10"
          title="Précédent"
        />

        {/* Indicateur visuel Précédent (Style YouTube) */}
        <div className={`absolute left-0 top-0 bottom-0 w-20 md:w-28 bg-white/5 flex items-center justify-center pointer-events-none transition-all duration-300 z-10 ${showLeftRipple ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <div className="bg-zinc-800/80 p-3 rounded-full flex items-center justify-center shadow-lg border border-white/10">
            <ChevronLeft size={28} className="text-white" />
          </div>
        </div>

        {/* CONTENU PRINCIPAL - Gros caractères */}
        <main className="flex-1 flex flex-col justify-around py-4 overflow-y-auto h-full px-16 md:px-32">
          
          {/* Info Chanson (Double Colonne) */}
          <div className="flex flex-row items-center justify-center gap-4 md:gap-8 max-w-4xl mx-auto w-full px-2">
            {/* Colonne Gauche : Compteur Géant */}
            <div className="text-right border-r border-zinc-800/80 pr-4 md:pr-6 shrink-0 select-none">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Morceau</span>
              <div className="text-3xl md:text-5xl font-black tracking-tighter mt-0.5">
                <span className="text-emerald-400">{currentIndex + 1}</span>
                <span className="text-zinc-700 mx-1">/</span>
                <span className="text-zinc-500 text-2xl md:text-3xl">{validSongIds.length}</span>
              </div>
            </div>

            {/* Colonne Droite : Titre et Groupe */}
            <div className="text-left min-w-0 flex-1">
              <h1 className="text-2xl md:text-5xl font-black tracking-tight text-white break-words leading-tight">{currentSong.title}</h1>
              <p className="text-sm md:text-xl text-zinc-400 font-semibold mt-1 break-words leading-snug">{currentSong.artist}</p>
            </div>
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
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Notes Batteristes</span>
                <div className="max-h-32 overflow-y-auto pr-1 text-left scrollbar-thin">
                  <p className="text-zinc-200 text-sm md:text-base font-semibold leading-relaxed break-all whitespace-pre-line">
                    {currentSong.comments}
                  </p>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* Bouton Suivant Géant à droite (en superposition invisible) */}
        <button
          onClick={handleNext}
          disabled={currentIndex === validSongIds.length - 1}
          className="absolute right-0 top-0 bottom-0 w-20 md:w-28 bg-transparent disabled:pointer-events-none z-20 focus:outline-none transition-all duration-200 cursor-pointer shrink-0 active:bg-white/10"
          title="Suivant"
        />

        {/* Indicateur visuel Suivant (Style YouTube) */}
        <div className={`absolute right-0 top-0 bottom-0 w-20 md:w-28 bg-white/5 flex items-center justify-center pointer-events-none transition-all duration-300 z-10 ${showRightRipple ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <div className="bg-zinc-800/80 p-3 rounded-full flex items-center justify-center shadow-lg border border-white/10">
            <ChevronRight size={28} className="text-white" />
          </div>
        </div>

      </div>

      {/* BARRE BASSE - Contrôles de scène */}
      <footer className="p-5 border-t border-zinc-900 bg-zinc-950/90 backdrop-blur-md flex items-center justify-center gap-4 z-10">
        
        {/* Contrôles du tempo */}
        <div className="flex gap-4 w-full justify-center max-w-lg">
          
          {/* Lancement avec Compte à rebours */}
          <button 
            onClick={() => handleTogglePlay(true)}
            className={`flex-1 px-6 py-3.5 rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${
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
            className={`flex-1 px-8 py-3.5 rounded-xl font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer ${
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

      {/* MODALE DE PARAMÈTRES DE SCÈNE */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] relative">
            
            {/* En-tête fixe */}
            <div className="flex justify-between items-center pb-4 border-b border-zinc-900 shrink-0">
              <h3 className="text-lg font-black text-zinc-100 flex items-center gap-2">
                <Settings className="text-emerald-400" size={20} /> Options de Scène
              </h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-500 hover:text-zinc-350 text-sm font-bold cursor-pointer p-1 rounded-lg hover:bg-zinc-900 transition-colors"
              >
                Fermer
              </button>
            </div>

            {/* Corps scrollable */}
            <div className="flex-1 overflow-y-auto py-4 pr-1 gap-6 flex flex-col scrollbar-thin scroll-smooth">
              {/* Couleur du Flash (1er temps) */}
              <div className="flex flex-col gap-3">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Couleur du Flash : 1er temps (Fort)</span>
                <div className="flex justify-between gap-2.5">
                  {[
                    { id: 'emerald', label: 'Vert', bg: 'bg-emerald-500' },
                    { id: 'amber', label: 'Orange', bg: 'bg-amber-500' },
                    { id: 'rose', label: 'Rouge', bg: 'bg-rose-500' },
                    { id: 'blue', label: 'Bleu', bg: 'bg-blue-500' },
                    { id: 'white', label: 'Blanc', bg: 'bg-white' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setFlashColor(c.id)}
                      className={`flex-1 py-3.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                        flashColor === c.id 
                          ? 'bg-zinc-900 border-zinc-700 shadow-inner scale-102 ring-1 ring-emerald-500/20' 
                          : 'bg-zinc-950 border-transparent hover:bg-zinc-900/50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${c.bg} shadow`} />
                      <span className={`text-[10px] font-bold ${flashColor === c.id ? 'text-zinc-200' : 'text-zinc-500'}`}>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Couleur du Flash (autres temps) */}
              <div className="flex flex-col gap-3">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Couleur du Flash : autres temps (Faibles)</span>
                <div className="flex justify-between gap-2.5">
                  {[
                    { id: 'none', label: 'Aucun', bg: 'bg-zinc-800' },
                    { id: 'emerald', label: 'Vert', bg: 'bg-emerald-500/50' },
                    { id: 'amber', label: 'Orange', bg: 'bg-amber-500/50' },
                    { id: 'rose', label: 'Rouge', bg: 'bg-rose-500/50' },
                    { id: 'blue', label: 'Bleu', bg: 'bg-blue-500/50' },
                    { id: 'white', label: 'Blanc', bg: 'bg-white/50' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setFlashColorWeak(c.id)}
                      className={`flex-1 py-3.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                        flashColorWeak === c.id 
                          ? 'bg-zinc-900 border-zinc-700 shadow-inner scale-102 ring-1 ring-emerald-500/20' 
                          : 'bg-zinc-950 border-transparent hover:bg-zinc-900/50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${c.bg} shadow`} />
                      <span className={`text-[10px] font-bold ${flashColorWeak === c.id ? 'text-zinc-200' : 'text-zinc-500'}`}>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Accentuer le premier temps */}
              <div className="flex items-center justify-between border-t border-zinc-900 pt-4">
                <div className="flex flex-col">
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Accentuer le premier temps</span>
                  <span className="text-[10px] text-zinc-500 font-semibold mt-0.5">Son aigu différent pour le temps fort</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAccentFirstBeat(!accentFirstBeat)}
                  className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                    accentFirstBeat ? 'bg-emerald-500' : 'bg-zinc-800'
                  }`}
                >
                  <div className={`bg-black w-4 h-4 rounded-full shadow-md transform duration-200 ease-in-out ${
                    accentFirstBeat ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Durée du Décompte */}
              <div className="flex flex-col gap-3">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Décompte (Temps)</span>
                <div className="flex items-center justify-between bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4">
                  <div className="flex flex-col">
                    <span className="text-2xl font-black text-zinc-200">{customCountdownBeats} temps</span>
                    <span className="text-[10px] text-zinc-500 font-semibold mt-0.5">Nombre de battements avant départ</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setCustomCountdownBeats(prev => Math.max(1, prev - 1))}
                      className="w-10 h-10 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-xl flex items-center justify-center font-black cursor-pointer select-none active:scale-95"
                    >
                      -
                    </button>
                    <button 
                      onClick={() => setCustomCountdownBeats(prev => Math.min(16, prev + 1))}
                      className="w-10 h-10 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-xl flex items-center justify-center font-black cursor-pointer select-none active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Assignation des Sons par Temps (12 Temps) */}
              <div className="flex flex-col gap-3 border-t border-zinc-900 pt-4">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider flex items-center justify-between">
                  Assignation des Sons par Temps
                </span>
                
                <div className="grid grid-cols-2 gap-3 bg-zinc-900/20 p-4 rounded-2xl border border-zinc-900">
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <span className="text-[10px] text-zinc-500 font-extrabold uppercase">Temps {idx + 1}</span>
                      <select
                        value={beatSounds[idx] || 'woodblock-low'}
                        onChange={(e) => {
                          const newSounds = [...beatSounds];
                          newSounds[idx] = e.target.value;
                          setBeatSounds(newSounds);
                        }}
                        className="bg-zinc-900 text-zinc-300 border border-zinc-850 rounded-lg p-2 text-xs font-semibold cursor-pointer outline-none hover:border-zinc-700"
                      >
                        <optgroup label="Bois (Woodblock)">
                          <option value="woodblock-high">Woodblock Aigu (1)</option>
                          <option value="woodblock-medium">Woodblock Moyen (2)</option>
                          <option value="woodblock-low">Woodblock Grave (3)</option>
                        </optgroup>
                        <optgroup label="Cloche (Cowbell)">
                          <option value="cowbell-high">Cowbell Aiguë</option>
                          <option value="cowbell-medium">Cowbell Moyenne</option>
                          <option value="cowbell-low">Cowbell Grave</option>
                        </optgroup>
                        <optgroup label="Bip (Synthé)">
                          <option value="synth-high">Synth Aigu</option>
                          <option value="synth-medium">Synth Moyen</option>
                          <option value="synth-low">Synth Grave</option>
                        </optgroup>
                        {customSounds.length > 0 && (
                          <optgroup label="Fichiers Personnalisés">
                            {customSounds.map((sound) => (
                              <option key={sound.id} value={`custom-${sound.id}`}>{sound.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pied de page fixe */}
            <div className="pt-4 border-t border-zinc-900 mt-2 shrink-0 bg-zinc-950">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black uppercase tracking-wider rounded-2xl cursor-pointer text-sm shadow-md shadow-emerald-950/20 active:scale-98 transition-all"
              >
                Enregistrer les options
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
