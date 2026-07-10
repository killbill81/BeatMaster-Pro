import React, { useState, useEffect } from 'react';
import { Music, ListMusic, Play, Sliders, Smartphone, Star, Settings, X, Cloud, CloudOff } from 'lucide-react';
import { db, seedDatabaseIfEmpty, Song } from './db/database';
import { MetronomeEngine } from './services/MetronomeEngine';
import { LibraryView } from './components/LibraryView';
import { SetlistManagerView } from './components/SetlistManagerView';
import { MetronomeController } from './components/MetronomeController';
import { SceneModeView } from './components/SceneModeView';
import { SpotifyService } from './services/SpotifyService';
import { AuthView } from './components/AuthView';
import { auth, isFirebaseConfigured, firestore } from './services/FirebaseService';
import { User, onAuthStateChanged } from 'firebase/auth';
import { onSnapshot, collection, getDocs } from 'firebase/firestore';

// Initialisation unique de notre moteur de métronome
const metronomeEngine = new MetronomeEngine();

type ActiveTab = 'library' | 'setlists' | 'metronome';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('library');
  const [dbSeeded, setDbSeeded] = useState<boolean>(false);
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  
  // États pour le Mode Scène
  const [liveModeActive, setLiveModeActive] = useState<boolean>(false);
  const [liveSongIds, setLiveSongIds] = useState<number[]>([]);
  const [liveTitle, setLiveTitle] = useState<string>('');

  // États Spotify globaux
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(SpotifyService.isAuthenticated());
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [spotifyClientId, setSpotifyClientId] = useState<string>(SpotifyService.getClientId());

  // États Firebase globaux
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Initialisation, seed de démonstration, écoute de session Firebase et callback Spotify
  useEffect(() => {
    const initApp = async () => {
      // 1. Gérer le callback Spotify OAuth PKCE s'il y a un code dans l'URL
      if (window.location.search.includes('code=')) {
        const success = await SpotifyService.handleCallback();
        if (success) {
          setSpotifyConnected(true);
          alert("Connexion Spotify réussie !");
        } else {
          alert("Échec de la connexion Spotify.");
        }
      }

      // 2. Initialiser la BD locale
      await seedDatabaseIfEmpty();
      setDbSeeded(true);
      const songs = await db.songs.toArray();
      setAllSongs(songs);
      
      // 3. Mettre à jour la connexion Spotify
      setSpotifyConnected(SpotifyService.isAuthenticated());

      // 4. Écouter la session Firebase
      if (isFirebaseConfigured && auth) {
        onAuthStateChanged(auth, (user) => {
          setFirebaseUser(user);
          setRefreshTrigger(prev => prev + 1);
          if (user) {
            setShowAuthModal(false);
          }
        });
      }
    };
    
    initApp();
  }, []);

  // Synchroniser allSongs (accès rapide en-tête) en temps réel avec Firestore si connecté
  useEffect(() => {
    let unsubscribeSongs: (() => void) | null = null;

    if (firebaseUser && isFirebaseConfigured && firestore) {
      const userId = firebaseUser.uid;
      const songsCol = collection(firestore, 'users', userId, 'songs');
      unsubscribeSongs = onSnapshot(songsCol, (snapshot) => {
        const cloudSongs = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as any[];
        setAllSongs(cloudSongs);
      }, (error) => {
        console.error("Erreur d'abonnement en-tête Firestore :", error);
      });
    } else {
      setAllSongs([]);
    }

    return () => {
      if (unsubscribeSongs) unsubscribeSongs();
    };
  }, [firebaseUser]);

  // Mettre à jour la liste globale des morceaux quand la BD change
  const handleRefreshSongs = async () => {
    if (firebaseUser && isFirebaseConfigured && firestore) {
      try {
        const userId = firebaseUser.uid;
        const songsCol = collection(firestore, 'users', userId, 'songs');
        const snapshot = await getDocs(songsCol);
        const cloudSongs = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as any[];
        setAllSongs(cloudSongs);
      } catch (err) {
        console.error("Erreur lors du rechargement des morceaux depuis Firestore :", err);
      }
    } else {
      const songs = await db.songs.toArray();
      setAllSongs(songs);
    }
  };

  // Lancer le mode scène pour un seul morceau
  const handleSelectSongForScene = (song: Song) => {
    if (song.id) {
      setLiveSongIds([song.id]);
      setLiveTitle(song.title);
      setLiveModeActive(true);
    }
  };

  // Lancer le mode scène pour une setlist complète
  const handleLoadSetlistInScene = (songIds: number[], setlistTitle: string) => {
    setLiveSongIds(songIds);
    setLiveTitle(setlistTitle);
    setLiveModeActive(true);
  };

  const handleSaveSettings = () => {
    SpotifyService.setClientId(spotifyClientId);
    setShowSettingsModal(false);
    alert("Configuration sauvegardée !");
  };

  const handleSpotifyDisconnect = () => {
    SpotifyService.logout();
    setSpotifyConnected(false);
    alert("Déconnecté de Spotify.");
  };

  if (!dbSeeded) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400 font-semibold tracking-wide">Initialisation de DrumPilot...</p>
        </div>
      </div>
    );
  }

  // Si le Mode Scène est actif, on court-circuite l'affichage de l'application
  if (liveModeActive) {
    return (
      <SceneModeView
        engine={metronomeEngine}
        songIds={liveSongIds}
        songsList={allSongs}
        setlistTitle={liveTitle}
        onExit={() => {
          setLiveModeActive(false);
          handleRefreshSongs(); // rafraîchir en cas de changements
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      
      {/* HEADER PRINCIPAL */}
      <header className="glass-panel sticky top-0 z-40 px-6 py-4 flex flex-col sm:flex-row justify-between items-center border-b border-zinc-900 bg-zinc-950/75 backdrop-blur-md gap-4">
        
        {/* Logo & Titre */}
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 text-zinc-950 p-2.5 rounded-xl shadow-lg glow-emerald/10">
            <Smartphone size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              DrumPilot
            </h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Copilote de Scène v1.0</p>
          </div>
        </div>
        
        {/* Menu Navigation Onglets + Options */}
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <nav className="flex gap-1.5 bg-zinc-900/60 p-1.5 rounded-xl border border-zinc-800/80">
            <button
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'library'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Music size={14} /> Bibliothèque
            </button>
            
            <button
              onClick={() => setActiveTab('setlists')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'setlists'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ListMusic size={14} /> Setlists
            </button>
            
            <button
              onClick={() => setActiveTab('metronome')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'metronome'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders size={14} /> Métronome
            </button>
          </nav>

          {/* Boutons d'état Cloud / Spotify / Paramètres */}
          <div className="flex gap-2">
            
            {/* BOUTON CLOUD SYNC FIREBASE */}
            {isFirebaseConfigured ? (
              <button
                onClick={() => setShowAuthModal(true)}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  firebaseUser 
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
                title={firebaseUser ? "Sauvegarde Cloud Active" : "Se connecter pour sauvegarder"}
              >
                <Cloud size={16} />
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-650 hover:text-zinc-500 transition-colors cursor-pointer"
                title="Firebase non configuré"
              >
                <CloudOff size={16} />
              </button>
            )}

            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
              title="Configuration Paramètres"
            >
              <Settings size={16} />
            </button>

            {spotifyConnected ? (
              <button
                onClick={handleSpotifyDisconnect}
                className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                title="Cliquer pour déconnecter Spotify"
              >
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                Spotify
              </button>
            ) : (
              <button
                onClick={() => setShowSettingsModal(true)}
                className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full"></span>
                Spotify
              </button>
            )}
          </div>
        </div>

      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 overflow-hidden flex flex-col gap-6">
        
        {/* Widget Live Rapide */}
        {activeTab !== 'metronome' && allSongs.length > 0 && (
          <div className="glass-panel rounded-2xl p-4 border border-zinc-900 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <div>
                <h4 className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Accès rapide Live</h4>
                <p className="text-sm font-bold text-zinc-200">Préparez et lancez le morceau sélectionné en mode scène.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2.5 items-center w-full md:w-auto">
              <select
                onChange={(e) => {
                  const song = allSongs.find(s => String(s.id) === String(e.target.value));
                  if (song) handleSelectSongForScene(song);
                }}
                defaultValue=""
                className="flex-1 md:flex-none px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="" disabled>Sélectionner un morceau...</option>
                {allSongs.map(s => (
                  <option key={String(s.id)} value={String(s.id)}>{s.title} ({s.bpm} BPM)</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* CONTENU DYNAMIQUE DES ONGLETS */}
        <div className="flex-1">
          {activeTab === 'library' && (
            <LibraryView 
              onSelectSong={(song) => {
                handleSelectSongForScene(song);
              }}
              currentPlayingSongId={liveSongIds.length === 1 ? liveSongIds[0] : undefined}
              refreshTrigger={refreshTrigger}
              firebaseUser={firebaseUser}
            />
          )}

          {activeTab === 'setlists' && (
            <SetlistManagerView 
              onLoadSetlistInScene={handleLoadSetlistInScene}
              refreshTrigger={refreshTrigger}
              firebaseUser={firebaseUser}
            />
          )}

          {activeTab === 'metronome' && (
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
              <div className="text-center md:text-left">
                <h2 className="text-xl font-bold text-zinc-100">Métronome Autonome</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Outil de pratique rapide sans morceaux de la bibliothèque.</p>
              </div>
              <MetronomeController 
                engine={metronomeEngine}
              />
            </div>
          )}
        </div>

      </main>

      {/* --- MODALE D'AUTHENTIFICATION FIREBASE --- */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="relative w-full max-w-md">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-350 z-55 cursor-pointer"
            >
              <X size={18} />
            </button>
            <AuthView 
              onSyncComplete={() => {
                handleRefreshSongs();
                setRefreshTrigger(prev => prev + 1);
              }}
            />
          </div>
        </div>
      )}

      {/* --- MODALE DES PARAMÈTRES GENERAUX & SPOTIFY --- */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-zinc-800 p-6 flex flex-col gap-5">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="font-extrabold text-base text-zinc-100">Paramètres de l'Application</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Configuration Client ID */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400 font-semibold">Spotify Client ID</label>
                <input
                  type="text"
                  placeholder="Coller votre Client ID du portail Spotify..."
                  value={spotifyClientId}
                  onChange={(e) => setSpotifyClientId(e.target.value)}
                  className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-300 font-mono text-xs"
                />
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Pour obtenir un Client ID, créez une application gratuite sur le portail <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">Spotify Developer</a>. 
                  Vous devez y enregistrer le <strong>Redirect URI</strong> exact ci-dessous dans les paramètres de votre application Spotify :
                </p>
                <div className="bg-zinc-950 p-2 rounded border border-zinc-900 flex items-center justify-between text-[10px] font-mono text-zinc-400 break-all select-all">
                  {SpotifyService.getRedirectUri()}
                </div>
              </div>

              {/* Bouton de Connexion Directe */}
              <div className="flex flex-col gap-2 border-t border-zinc-900 pt-4">
                <label className="text-xs text-zinc-400 font-semibold">Statut Spotify</label>
                {spotifyConnected ? (
                  <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-xl">
                    <span className="text-xs text-emerald-400 font-medium">Connecté avec succès.</span>
                    <button
                      onClick={handleSpotifyDisconnect}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs rounded-lg border border-rose-500/15 cursor-pointer"
                    >
                      Déconnecter
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-zinc-900/50 border border-zinc-850 p-3 rounded-xl">
                    <span className="text-xs text-zinc-500">Non authentifié.</span>
                    <button
                      onClick={async () => {
                        SpotifyService.setClientId(spotifyClientId);
                        try {
                          await SpotifyService.login();
                        } catch (err: any) {
                          alert(err.message);
                        }
                      }}
                      disabled={!spotifyClientId}
                      className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-zinc-950 font-bold text-xs rounded-lg cursor-pointer"
                    >
                      Se connecter
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end border-t border-zinc-800 pt-4 mt-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-400 font-bold text-sm cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-lg hover:shadow-emerald-500/10 cursor-pointer"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="py-4 px-6 text-center border-t border-zinc-900/60 bg-zinc-950/30 text-[10px] text-zinc-650 font-medium">
        DrumPilot est conçu pour fonctionner hors connexion • Données enregistrées localement dans votre navigateur.
      </footer>

    </div>
  );
};

export default App;
