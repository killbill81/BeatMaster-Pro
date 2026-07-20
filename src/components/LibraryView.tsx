import React, { useState, useEffect } from 'react';
import { Search, Star, Music, Plus, Trash2, Edit2, Play, ExternalLink, Hash, X, Check, Eye } from 'lucide-react';
import { db, Song } from '../db/database';
import { SpotifyService, SpotifyTrack } from '../services/SpotifyService';
import { auth, firestore } from '../services/FirebaseService';
import { deleteDoc, doc, collection, query, where, getDocs, setDoc, onSnapshot, addDoc } from 'firebase/firestore';
import { type User } from 'firebase/auth';

interface LibraryViewProps {
  onSelectSong: (song: Song) => void;
  currentPlayingSongId?: number;
  refreshTrigger?: number;
  firebaseUser?: User | null;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ 
  onSelectSong, 
  currentPlayingSongId, 
  refreshTrigger,
  firebaseUser
}) => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [allTags, setAllTags] = useState<string[]>([]);

  // État du formulaire d'édition/ajout
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingSong, setEditingSong] = useState<Partial<Song> | null>(null);

  // États pour l'intégration Spotify
  const [showSpotifySearch, setShowSpotifySearch] = useState<boolean>(false);
  const [spotifyQuery, setSpotifyQuery] = useState<string>('');
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrack[]>([]);
  const [isSpotifyLoading, setIsSpotifyLoading] = useState<boolean>(false);
  const [spotifyError, setSpotifyError] = useState<string>('');
  const [showSpotifyConfig, setShowSpotifyConfig] = useState<boolean>(false);
  const [spotifyClientIdInput, setSpotifyClientIdInput] = useState<string>(SpotifyService.getClientId());
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState<boolean>(SpotifyService.isAuthenticated());

  // Charger les morceaux
  const loadSongs = async () => {
    try {
      let querySongs = await db.songs.toArray();
      setSongs(querySongs);

      // Extraire tous les tags uniques
      const tags = new Set<string>();
      querySongs.forEach(song => {
        if (song.tags) song.tags.forEach(t => tags.add(t));
      });
      setAllTags(Array.from(tags));
    } catch (e) {
      console.error("Erreur de chargement des morceaux", e);
    }
  };

  useEffect(() => {
    if (firebaseUser && firestore) {
      const userId = firebaseUser.uid;
      const songsCol = collection(firestore, 'users', userId, 'songs');
      const unsubscribe = onSnapshot(songsCol, (snapshot) => {
        const cloudSongs = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as any[];
        setSongs(cloudSongs);

        const tags = new Set<string>();
        cloudSongs.forEach(song => {
          if (song.tags) song.tags.forEach((t: string) => tags.add(t));
        });
        setAllTags(Array.from(tags));
      }, (error) => {
        console.error("Erreur d'abonnement en temps réel Firestore :", error);
      });
      return () => unsubscribe();
    } else {
      setSongs([]);
      setAllTags([]);
    }
  }, [refreshTrigger, firebaseUser]);

  // Vérifier périodiquement l'état d'authentification Spotify
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSpotifyAuthenticated(SpotifyService.isAuthenticated());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Ouvrir la recherche Spotify avec des mots-clés pré-remplis si disponibles
  useEffect(() => {
    if (showSpotifySearch && editingSong) {
      const initialQuery = `${editingSong.title || ''} ${editingSong.artist || ''}`.trim();
      setSpotifyQuery(initialQuery);
      if (initialQuery && isSpotifyAuthenticated) {
        triggerSpotifySearch(initialQuery);
      }
    } else {
      setSpotifyResults([]);
      setSpotifyQuery('');
      setSpotifyError('');
    }
  }, [showSpotifySearch]);

  // Filtrer les morceaux
  const filteredSongs = songs.filter(song => {
    const matchesSearch = 
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (song.album && song.album.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (song.comments && song.comments.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesTag = !selectedTag || song.tags.includes(selectedTag);
    const matchesFavorite = !showFavoritesOnly || song.favorite;

    return matchesSearch && matchesTag && matchesFavorite;
  });



  // Gérer la suppression
  const deleteSong = async (e: React.MouseEvent, id: any) => {
    e.stopPropagation();
    if (window.confirm("Voulez-vous vraiment supprimer ce morceau de la bibliothèque ?")) {
      try {
        if (firebaseUser && firestore) {
          const userId = firebaseUser.uid;
          await deleteDoc(doc(firestore, 'users', userId, 'songs', String(id)));
        } else {
          await db.songs.delete(Number(id));
          loadSongs();
        }
      } catch (err) {
        console.error("Erreur lors de la suppression du morceau :", err);
      }
    }
  };

  // Basculer l'état de favori d'un morceau
  const toggleFavorite = async (e: React.MouseEvent, song: Song) => {
    e.stopPropagation();
    if (!song.id) return;
    
    const newFavoriteStatus = !song.favorite;

    try {
      if (firebaseUser && firestore) {
        const userId = firebaseUser.uid;
        await setDoc(doc(firestore, 'users', userId, 'songs', String(song.id)), {
          ...song,
          favorite: newFavoriteStatus
        });
      } else {
        const updatedSong = { ...song, favorite: newFavoriteStatus };
        await db.songs.put(updatedSong as any);
        loadSongs();
      }
    } catch (err) {
      console.error("Erreur lors de la mise à jour du statut favori :", err);
    }
  };

  // Ouvrir le formulaire pour un nouveau morceau
  const handleAddNew = () => {
    setEditingSong({
      title: '',
      artist: '',
      album: '',
      bpm: 120,
      timeSignature: '4/4',
      key: '',
      duration: '',
      comments: '',
      tags: [],
      color: '#3b82f6',
      favorite: false,
      difficulty: 3,
      structure: '',
    });
    setIsEditing(true);
  };

  // Ouvrir le formulaire pour modifier un morceau
  const handleEdit = (e: React.MouseEvent, song: Song) => {
    e.stopPropagation();
    setEditingSong({ ...song });
    setIsEditing(true);
  };

  // Enregistrer le morceau (Ajout ou Modification)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSong || !editingSong.title || !editingSong.artist || !editingSong.bpm) {
      alert("Le titre, l'artiste et le BPM sont requis !");
      return;
    }

    const songData: Song = {
      title: editingSong.title,
      artist: editingSong.artist,
      album: editingSong.album || '',
      bpm: Number(editingSong.bpm),
      timeSignature: editingSong.timeSignature || '4/4',
      key: editingSong.key || '',
      duration: editingSong.duration || '',
      comments: editingSong.comments || '',
      tags: editingSong.tags || [],
      color: editingSong.color || '#3b82f6',
      favorite: editingSong.favorite || false,
      difficulty: Number(editingSong.difficulty || 3),
      structure: editingSong.structure || '',
      youtubeUrl: editingSong.youtubeUrl || '',
      spotifyUrl: editingSong.spotifyUrl || '',
      dateAdded: editingSong.id ? (editingSong.dateAdded || new Date()) : new Date(),
    };

    try {
      if (firebaseUser && firestore) {
        const userId = firebaseUser.uid;
        const dateObj = (typeof songData.dateAdded === 'string' || (songData.dateAdded as any) instanceof String)
          ? new Date(songData.dateAdded)
          : songData.dateAdded;

        const songToSave = {
          ...songData,
          dateAdded: dateObj.toISOString() // Formater en chaîne ISO pour Firestore
        };

        if (editingSong.id) {
          await setDoc(doc(firestore, 'users', userId, 'songs', String(editingSong.id)), songToSave);
        } else {
          await addDoc(collection(firestore, 'users', userId, 'songs'), songToSave);
        }
      } else {
        if (editingSong.id) {
          await db.songs.put({ ...songData, id: Number(editingSong.id) });
        } else {
          await db.songs.add(songData);
        }
        loadSongs();
      }
      setIsEditing(false);
      setEditingSong(null);
    } catch (err: any) {
      console.error("Erreur lors de la sauvegarde du morceau :", err);
      alert("Erreur lors de la sauvegarde du morceau : " + err.message);
    }
  };

  // --- LOGIQUE SPOTIFY ---

  const handleSaveSpotifyClientId = () => {
    if (!spotifyClientIdInput.trim()) {
      alert("Veuillez saisir un Client ID valide.");
      return;
    }
    SpotifyService.setClientId(spotifyClientIdInput);
    setShowSpotifyConfig(false);
    alert("Client ID Spotify sauvegardé ! Vous pouvez maintenant vous connecter.");
  };

  const handleSpotifyConnect = async () => {
    try {
      if (!SpotifyService.getClientId()) {
        setShowSpotifyConfig(true);
        return;
      }
      await SpotifyService.login();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const triggerSpotifySearch = async (query: string) => {
    if (!query.trim()) return;
    setIsSpotifyLoading(true);
    setSpotifyError('');
    try {
      const results = await SpotifyService.searchTracks(query);
      setSpotifyResults(results);
    } catch (err: any) {
      setSpotifyError(err.message || "Erreur de recherche.");
    } finally {
      setIsSpotifyLoading(false);
    }
  };

  const handleSpotifySearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerSpotifySearch(spotifyQuery);
  };

  const handleSelectSpotifyTrack = async (track: SpotifyTrack) => {
    setIsSpotifyLoading(true);
    setSpotifyError('');
    try {
      // 1. Récupérer les Audio Features (BPM, Signature, Key)
      const features = await SpotifyService.getAudioFeatures(track.id);
      
      // 2. Mettre à jour le formulaire d'édition
      const isRestricted = features.bpm === 0;
      
      if (editingSong) {
        setEditingSong({
          ...editingSong,
          title: track.title,
          artist: track.artist,
          album: track.album,
          bpm: isRestricted ? (editingSong.bpm || 120) : features.bpm,
          timeSignature: isRestricted ? (editingSong.timeSignature || '4/4') : features.timeSignature,
          key: isRestricted ? (editingSong.key || '') : features.key,
          duration: SpotifyService.formatDuration(track.durationMs),
          spotifyUrl: track.spotifyUrl,
          comments: editingSong.comments || `Pochette : ${track.albumArtUrl || ''}`
        });
      }
      setShowSpotifySearch(false);
      
      if (isRestricted) {
        alert("🎵 Morceau importé avec succès !\n\nNote : Spotify restreint désormais l'accès aux caractéristiques de tempo (BPM) et de tonalité pour les nouvelles applications. Veuillez saisir le BPM manuellement.");
      }
    } catch (err: any) {
      setSpotifyError("Erreur de récupération des détails audio : " + err.message);
    } finally {
      setIsSpotifyLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full relative">
      {/* Barre de Recherche et Filtres */}
      {!isEditing && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Input de recherche */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <Search size={18} />
              </span>
              <input
                type="text"
                placeholder="Rechercher par titre, artiste, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
              />
            </div>
            
            {/* Filtre favoris */}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                showFavoritesOnly 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <Star size={16} fill={showFavoritesOnly ? 'currentColor' : 'none'} /> Favoris
            </button>

            {/* Ajouter Nouveau */}
            <button
              onClick={handleAddNew}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm flex items-center gap-2 shadow-lg hover:shadow-emerald-500/10 transition-all cursor-pointer"
            >
              <Plus size={16} /> Nouveau morceau
            </button>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mr-1">Filtres :</span>
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                  selectedTag === null 
                    ? 'bg-zinc-100 text-zinc-900' 
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-300'
                }`}
              >
                Tous
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                    selectedTag === tag 
                      ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' 
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vue Liste des Morceaux */}
      {!isEditing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[600px] pr-1">
          {filteredSongs.length > 0 ? (
            filteredSongs.map((song) => (
              <div
                key={song.id}
                onClick={() => onSelectSong(song)}
                className={`glass-panel rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between border hover:border-zinc-700/80 transition-all cursor-pointer group gap-3.5 md:gap-4 ${
                  currentPlayingSongId === song.id 
                    ? 'border-emerald-500/60 shadow-md glow-emerald/5' 
                    : 'border-zinc-900'
                }`}
              >
                {/* Couleur et Infos Principales */}
                <div className="flex items-start gap-3.5 w-full md:flex-1 min-w-0">
                  {/* Badge de couleur du morceau */}
                  <div 
                    className="w-2.5 h-12 rounded-full shrink-0 mt-0.5" 
                    style={{ backgroundColor: song.color || '#3b82f6' }}
                  />
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between md:justify-start gap-2">
                      <h3 className="font-bold text-zinc-100 break-words leading-snug group-hover:text-emerald-400 transition-colors flex-1">
                        {song.title}
                      </h3>
                      <button
                        onClick={(e) => toggleFavorite(e, song)}
                        className="p-1 rounded hover:bg-zinc-800/80 transition-colors cursor-pointer shrink-0 mt-0.5"
                        title={song.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                      >
                        <Star 
                          size={13} 
                          className={song.favorite ? "text-amber-400" : "text-zinc-650 hover:text-amber-400"} 
                          fill={song.favorite ? "currentColor" : "none"} 
                        />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-400 break-words mt-1 leading-normal">{song.artist}</p>
                    
                    {/* Tags */}
                    {song.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {song.tags.slice(0, 3).map((t, idx) => (
                          <span key={idx} className="text-[9px] bg-zinc-900 text-zinc-500 px-2 py-0.5 rounded font-medium">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Métriques BPM et Actions */}
                <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto shrink-0 border-t border-zinc-900/40 md:border-t-0 pt-3.5 md:pt-0 pl-0 md:pl-3 mt-1 md:mt-0">
                  {/* Métriques à gauche sur mobile, à côté sur PC */}
                  <div className="flex items-center gap-4">
                    {/* Colonne BPM fixe */}
                    <div className="w-14 text-center">
                      <span className="text-2xl font-black text-emerald-400 block leading-none">{song.bpm}</span>
                      <span className="text-[9px] text-zinc-500 block font-semibold uppercase tracking-wider mt-1">BPM</span>
                    </div>

                    {/* Colonne Boîte Noire Signature fixe */}
                    <div className="text-center bg-zinc-900/60 border border-zinc-800 px-2 py-1.5 rounded-lg w-24 shrink-0 flex flex-col justify-center min-h-[42px]">
                      <span className="text-xs font-bold text-zinc-300 block">{song.timeSignature}</span>
                      {song.key ? (
                        <span className="text-[8px] text-zinc-500 block font-bold uppercase mt-0.5 truncate" title={song.key}>{song.key}</span>
                      ) : (
                        <span className="text-[8px] text-zinc-650 block font-bold uppercase mt-0.5">-</span>
                      )}
                    </div>
                  </div>

                  {/* Colonne Actions fixe */}
                  <div className="w-[105px] flex items-center justify-end gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                    {song.spotifyUrl && (
                      <a
                        href={song.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-lg bg-zinc-900 text-emerald-400 hover:text-emerald-300 hover:bg-zinc-800 transition-colors"
                        title="Ouvrir Spotify"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      onClick={(e) => handleEdit(e, song)}
                      className="p-2 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                      title="Modifier"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={(e) => deleteSong(e, song.id!)}
                      className="p-2 rounded-lg bg-zinc-900 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center text-zinc-500 glass-panel rounded-2xl border border-zinc-900">
              <Music size={40} className="mx-auto text-zinc-700 mb-3" />
              <p className="font-semibold text-zinc-400">Aucun morceau trouvé</p>
              <p className="text-xs text-zinc-600 mt-1">Essayez une autre recherche ou ajoutez un nouveau morceau.</p>
            </div>
          )}
        </div>
      )}

      {/* Formulaire d'Ajout / Modification */}
      {isEditing && editingSong && (
        <form onSubmit={handleSave} className="glass-panel rounded-2xl p-6 border border-zinc-800 flex flex-col gap-5">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
            <div>
              <h3 className="font-bold text-lg text-zinc-100">
                {editingSong.id ? "Modifier le morceau" : "Ajouter un nouveau morceau"}
              </h3>
              <p className="text-[10px] text-zinc-500">Saisissez les détails ou importez-les depuis Spotify.</p>
            </div>
            <div className="flex gap-2">
              {/* BOUTON D'IMPORTATION SPOTIFY */}
              <button
                type="button"
                onClick={() => setShowSpotifySearch(true)}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                🎧 Importer de Spotify
              </button>
              <button 
                type="button" 
                onClick={() => setIsEditing(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Titre */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Titre du morceau *</label>
              <input
                type="text"
                required
                value={editingSong.title || ''}
                onChange={(e) => setEditingSong({ ...editingSong, title: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                placeholder="ex: Rosanna"
              />
            </div>

            {/* Artiste */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Artiste / Groupe *</label>
              <input
                type="text"
                required
                value={editingSong.artist || ''}
                onChange={(e) => setEditingSong({ ...editingSong, artist: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                placeholder="ex: Toto"
              />
            </div>

            {/* Album */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Album</label>
              <input
                type="text"
                value={editingSong.album || ''}
                onChange={(e) => setEditingSong({ ...editingSong, album: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                placeholder="ex: Toto IV"
              />
            </div>

            {/* BPM */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">BPM *</label>
              <input
                type="number"
                required
                min={30}
                max={300}
                value={editingSong.bpm || 120}
                onChange={(e) => setEditingSong({ ...editingSong, bpm: Number(e.target.value) })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
              />
            </div>

            {/* Signature */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Signature rythmique</label>
              <select
                value={editingSong.timeSignature || '4/4'}
                onChange={(e) => setEditingSong({ ...editingSong, timeSignature: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
              >
                <option value="4/4">4/4</option>
                <option value="3/4">3/4</option>
                <option value="6/8">6/8</option>
                <option value="12/8">12/8</option>
                <option value="5/4">5/4</option>
                <option value="7/8">7/8</option>
              </select>
            </div>

            {/* Tonalité */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Tonalité</label>
              <input
                type="text"
                value={editingSong.key || ''}
                onChange={(e) => setEditingSong({ ...editingSong, key: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                placeholder="ex: G Major"
              />
            </div>

            {/* Durée */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Durée (MM:SS)</label>
              <input
                type="text"
                value={editingSong.duration || ''}
                onChange={(e) => setEditingSong({ ...editingSong, duration: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                placeholder="ex: 5:31"
              />
            </div>

            {/* Difficulté */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Difficulté (1 à 5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={editingSong.difficulty || 3}
                onChange={(e) => setEditingSong({ ...editingSong, difficulty: Number(e.target.value) })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
              />
            </div>

            {/* Couleur du badge */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Couleur d'identification</label>
              <div className="flex gap-2.5 items-center">
                <input
                  type="color"
                  value={editingSong.color || '#3b82f6'}
                  onChange={(e) => setEditingSong({ ...editingSong, color: e.target.value })}
                  className="w-10 h-9 bg-zinc-900 border border-zinc-850 rounded cursor-pointer"
                />
                <span className="text-xs text-zinc-500 font-mono">{editingSong.color}</span>
              </div>
            </div>

            {/* Lien Spotify */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Lien Spotify</label>
              <input
                type="url"
                value={editingSong.spotifyUrl || ''}
                onChange={(e) => setEditingSong({ ...editingSong, spotifyUrl: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                placeholder="Lien de la chanson"
              />
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs text-zinc-400 font-semibold">Tags (séparés par des virgules)</label>
              <input
                type="text"
                value={editingSong.tags?.join(', ') || ''}
                onChange={(e) => setEditingSong({ 
                  ...editingSong, 
                  tags: e.target.value.split(',').map(s => s.trim()).filter(s => s !== '') 
                })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                placeholder="ex: Shuffle, Groove"
              />
            </div>

            {/* Structure du morceau */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs text-zinc-400 font-semibold">
                Structure du morceau (format: Nom [Nombre de mesures] - ex: Intro [8] - Couplet [16] - Refrain [8])
              </label>
              <input
                type="text"
                value={editingSong.structure || ''}
                onChange={(e) => setEditingSong({ ...editingSong, structure: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                placeholder="ex: Intro [4] - Couplet [8] - Refrain [8]"
              />
            </div>

            {/* Commentaires */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs text-zinc-400 font-semibold">Commentaires & Notes batterie (breaks, astuces...)</label>
              <textarea
                rows={3}
                value={editingSong.comments || ''}
                onChange={(e) => setEditingSong({ ...editingSong, comments: e.target.value })}
                className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm resize-none"
                placeholder="Détaillez le départ de batterie, des breaks particuliers..."
              />
            </div>

            {/* Options */}
            <div className="flex items-center gap-2 py-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={editingSong.favorite || false}
                  onChange={(e) => setEditingSong({ ...editingSong, favorite: e.target.checked })}
                  className="accent-emerald-500 rounded border-zinc-800 bg-zinc-900 w-4 h-4"
                />
                Ajouter aux favoris
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end border-t border-zinc-800 pt-4 mt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-400 font-bold text-sm cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm flex items-center gap-2 shadow-lg hover:shadow-emerald-500/10 cursor-pointer"
            >
              <Check size={16} /> Enregistrer
            </button>
          </div>
        </form>
      )}

      {/* --- MODALE DE RECHERCHE SPOTIFY --- */}
      {showSpotifySearch && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-panel w-full max-w-xl rounded-2xl border border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header Modale */}
            <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950/40">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xl">🎧</span>
                <div>
                  <h3 className="font-extrabold text-sm text-zinc-100">Rechercher sur Spotify</h3>
                  <p className="text-[10px] text-zinc-500">BPM, Signature et Tonalité seront importés</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSpotifySearch(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenu principal */}
            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
              
              {/* Étape 1 : Si non configuré / non connecté */}
              {!isSpotifyAuthenticated ? (
                <div className="text-center py-6 flex flex-col gap-4">
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Vous devez d'abord configurer votre **Client ID** Spotify dans DrumPilot pour pouvoir vous connecter à votre compte.
                  </p>
                  
                  {showSpotifyConfig ? (
                    <div className="flex flex-col gap-2 max-w-xs mx-auto border border-zinc-850 p-4 rounded-xl bg-zinc-950/40">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black text-left block">Spotify Client ID</label>
                      <input 
                        type="text"
                        placeholder="Coller votre Client ID ici..."
                        value={spotifyClientIdInput}
                        onChange={(e) => setSpotifyClientIdInput(e.target.value)}
                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:border-emerald-500 text-zinc-300 font-mono"
                      />
                      <div className="flex gap-2 justify-end mt-2">
                        <button 
                          type="button" 
                          onClick={() => setShowSpotifyConfig(false)}
                          className="px-2.5 py-1 text-[10px] text-zinc-400 bg-zinc-900 hover:bg-zinc-850 rounded"
                        >
                          Retour
                        </button>
                        <button 
                          type="button" 
                          onClick={handleSaveSpotifyClientId}
                          className="px-3 py-1 text-[10px] bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded"
                        >
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 items-center">
                      <button
                        type="button"
                        onClick={handleSpotifyConnect}
                        className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/20"
                      >
                        Se connecter à Spotify
                      </button>
                      <button 
                        type="button"
                        onClick={() => setShowSpotifyConfig(true)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-400 underline"
                      >
                        Configurer le Client ID
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Étape 2 : Barre de recherche de morceaux
                <div className="flex flex-col gap-4">
                  <form onSubmit={handleSpotifySearchSubmit} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nom de chanson, artiste..."
                      value={spotifyQuery}
                      onChange={(e) => setSpotifyQuery(e.target.value)}
                      className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-xs"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isSpotifyLoading}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      Rechercher
                    </button>
                  </form>

                  {/* Indicateurs de statut */}
                  {isSpotifyLoading && (
                    <div className="py-8 text-center flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] text-zinc-500">Recherche en cours...</p>
                    </div>
                  )}

                  {spotifyError && (
                    <div className="p-3 bg-rose-950/20 border border-rose-900/30 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                      <span>⚠️</span>
                      <p className="flex-1">{spotifyError}</p>
                      <button 
                        onClick={handleSpotifyConnect} 
                        className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold rounded-lg border border-rose-500/15"
                      >
                        Reconnexion
                      </button>
                    </div>
                  )}

                  {/* Résultats de recherche */}
                  {!isSpotifyLoading && spotifyResults.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {spotifyResults.map(track => (
                        <div
                          key={track.id}
                          onClick={() => handleSelectSpotifyTrack(track)}
                          className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-900 hover:border-zinc-850 hover:bg-zinc-900 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {track.albumArtUrl ? (
                              <img 
                                src={track.albumArtUrl} 
                                alt={track.album} 
                                className="w-10 h-10 rounded-lg object-cover shrink-0 border border-zinc-800"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-zinc-950 flex items-center justify-center shrink-0 border border-zinc-900 text-zinc-650">
                                🎵
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="font-bold text-xs text-zinc-200 block truncate group-hover:text-emerald-400 transition-colors">
                                {track.title}
                              </span>
                              <span className="text-[10px] text-zinc-500 block truncate">{track.artist} • {track.album}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-zinc-500 font-semibold bg-zinc-950 border border-zinc-850 px-2 py-0.5 rounded">
                              {SpotifyService.formatDuration(track.durationMs)}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-black opacity-0 group-hover:opacity-100 transition-all">Import ➔</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Aucun résultat */}
                  {!isSpotifyLoading && spotifyResults.length === 0 && spotifyQuery && !spotifyError && (
                    <p className="text-zinc-600 text-xs text-center py-6">Aucun morceau correspondant sur Spotify.</p>
                  )}

                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
