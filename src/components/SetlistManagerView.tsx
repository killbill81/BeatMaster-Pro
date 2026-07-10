import React, { useState, useEffect } from 'react';
import { Play, Plus, Trash2, Edit2, ChevronUp, ChevronDown, ListMusic, Star, Trash, Check, X } from 'lucide-react';
import { db, Song, Setlist } from '../db/database';
import { auth, firestore } from '../services/FirebaseService';
import { deleteDoc, doc, collection, query, where, getDocs, onSnapshot, addDoc, setDoc } from 'firebase/firestore';
import { type User } from 'firebase/auth';

interface SetlistManagerViewProps {
  onLoadSetlistInScene: (songIds: any[], setlistTitle: string) => void;
  refreshTrigger?: number;
  firebaseUser?: User | null;
}

export const SetlistManagerView: React.FC<SetlistManagerViewProps> = ({ 
  onLoadSetlistInScene, 
  refreshTrigger,
  firebaseUser
}) => {
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  
  // États d'édition/création
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingSetlist, setEditingSetlist] = useState<Partial<Setlist> | null>(null);
  const [expandedSetlistId, setExpandedSetlistId] = useState<any | null>(null);
  
  // Chargement des données
  const loadData = async () => {
    try {
      const allSetlists = await db.setlists.toArray();
      const allSongs = await db.songs.toArray();
      setSetlists(allSetlists);
      setSongs(allSongs);
    } catch (e) {
      console.error("Erreur de chargement des setlists", e);
    }
  };

  useEffect(() => {
    if (firebaseUser && firestore) {
      const userId = firebaseUser.uid;
      
      // Écouter les morceaux en temps réel (nécessaire pour résoudre les détails de setlist)
      const songsCol = collection(firestore, 'users', userId, 'songs');
      const unsubSongs = onSnapshot(songsCol, (snapshot) => {
        const cloudSongs = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as any[];
        setSongs(cloudSongs);
      });

      // Écouter les setlists en temps réel
      const setlistsCol = collection(firestore, 'users', userId, 'setlists');
      const unsubSetlists = onSnapshot(setlistsCol, (snapshot) => {
        const cloudSetlists = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          // Si Firestore stocke songDetails (pour le portage) mais pas songIds, résolvons-les dynamiquement si besoin.
          // En direct Firestore, on va stocker les strings IDs des documents.
          return {
            ...data,
            id: docSnap.id,
            songIds: data.songIds || []
          };
        }) as any[];
        setSetlists(cloudSetlists);
      });

      return () => {
        unsubSongs();
        unsubSetlists();
      };
    } else {
      setSetlists([]);
      setSongs([]);
    }
  }, [refreshTrigger, firebaseUser]);

  const handleAddNew = () => {
    setEditingSetlist({
      title: '',
      description: '',
      songIds: [],
    });
    setIsEditing(true);
  };

  const handleEdit = (setlist: Setlist) => {
    setEditingSetlist({ ...setlist });
    setIsEditing(true);
  };

  const handleDelete = async (id: any) => {
    if (window.confirm("Voulez-vous vraiment supprimer cette setlist ?")) {
      try {
        if (firebaseUser && firestore) {
          const userId = firebaseUser.uid;
          await deleteDoc(doc(firestore, 'users', userId, 'setlists', String(id)));
        } else {
          await db.setlists.delete(Number(id));
          loadData();
        }
      } catch (err) {
        console.error("Erreur lors de la suppression de la setlist :", err);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSetlist || !editingSetlist.title) {
      alert("Le titre est requis !");
      return;
    }

    const setlistData: Setlist = {
      title: editingSetlist.title,
      description: editingSetlist.description || '',
      songIds: editingSetlist.songIds || [],
      dateCreated: editingSetlist.id ? (editingSetlist.dateCreated || new Date()) : new Date()
    };

    try {
      if (firebaseUser && firestore) {
        const userId = firebaseUser.uid;
        const songDetails = setlistData.songIds.map(sid => {
          const song = songs.find(s => s.id === sid);
          return song ? { title: song.title, artist: song.artist } : null;
        }).filter(Boolean);

        const dateObj = (typeof setlistData.dateCreated === 'string' || (setlistData.dateCreated as any) instanceof String)
          ? new Date(setlistData.dateCreated)
          : setlistData.dateCreated;

        const setlistToSave = {
          ...setlistData,
          songDetails,
          dateCreated: dateObj.toISOString()
        };

        if (editingSetlist.id) {
          await setDoc(doc(firestore, 'users', userId, 'setlists', String(editingSetlist.id)), setlistToSave);
        } else {
          await addDoc(collection(firestore, 'users', userId, 'setlists'), setlistToSave);
        }
      } else {
        if (editingSetlist.id) {
          await db.setlists.put({ ...setlistData, id: Number(editingSetlist.id) });
        } else {
          await db.setlists.add(setlistData);
        }
        loadData();
      }
      setIsEditing(false);
      setEditingSetlist(null);
    } catch (err: any) {
      console.error("Erreur lors de la sauvegarde de la setlist :", err);
      alert("Erreur lors de la sauvegarde de la setlist : " + err.message);
    }
  };

  // Ajouter un morceau à la setlist en cours d'édition
  const addSongToSetlist = (songId: number) => {
    if (!editingSetlist) return;
    const currentIds = editingSetlist.songIds || [];
    setEditingSetlist({
      ...editingSetlist,
      songIds: [...currentIds, songId]
    });
  };

  // Retirer un morceau de la setlist en cours d'édition
  const removeSongFromSetlist = (indexToRemove: number) => {
    if (!editingSetlist) return;
    const currentIds = editingSetlist.songIds || [];
    const updatedIds = currentIds.filter((_, idx) => idx !== indexToRemove);
    setEditingSetlist({
      ...editingSetlist,
      songIds: updatedIds
    });
  };

  // Réordonner les morceaux de la setlist en cours d'édition
  const moveSong = (index: number, direction: 'up' | 'down') => {
    if (!editingSetlist || !editingSetlist.songIds) return;
    const ids = [...editingSetlist.songIds];
    
    if (direction === 'up' && index > 0) {
      const temp = ids[index];
      ids[index] = ids[index - 1];
      ids[index - 1] = temp;
    } else if (direction === 'down' && index < ids.length - 1) {
      const temp = ids[index];
      ids[index] = ids[index + 1];
      ids[index + 1] = temp;
    }

    setEditingSetlist({
      ...editingSetlist,
      songIds: ids
    });
  };

  // Lancer une setlist en mode scène
  const playSetlist = (setlist: Setlist) => {
    if (setlist.songIds.length === 0) {
      alert("Cette setlist ne contient aucun morceau !");
      return;
    }
    onLoadSetlistInScene(setlist.songIds, setlist.title);
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      
      {!isEditing && (
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <ListMusic className="text-emerald-400" /> Vos Setlists / Concerts
          </h2>
          <button
            onClick={handleAddNew}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm flex items-center gap-2 shadow-lg hover:shadow-emerald-500/10 cursor-pointer transition-all"
          >
            <Plus size={16} /> Nouvelle setlist
          </button>
        </div>
      )}

      {/* Liste des Setlists */}
      {!isEditing && (
        <div className="flex flex-col gap-4 overflow-y-auto max-h-[600px] pr-1">
          {setlists.length > 0 ? (
            setlists.map((setlist) => {
              const isExpanded = expandedSetlistId === setlist.id;
              return (
                <div 
                  key={setlist.id}
                  className="glass-panel rounded-xl p-5 border border-zinc-900 hover:border-zinc-850 transition-all flex flex-col gap-4"
                >
                  {/* Ligne Supérieure : Titre et Actions */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div 
                      onClick={() => setExpandedSetlistId(isExpanded ? null : setlist.id)}
                      className="cursor-pointer flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-zinc-100 hover:text-emerald-400 transition-colors truncate">
                          {setlist.title}
                        </h3>
                        <span className="text-zinc-500 text-xs mt-0.5">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      </div>
                      {setlist.description && (
                        <p className="text-sm text-zinc-400 mt-1 max-w-xl truncate">{setlist.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs bg-zinc-900 border border-zinc-800 text-emerald-400 font-bold px-2 py-0.5 rounded-md">
                          {setlist.songIds.length} morceau{setlist.songIds.length > 1 ? 'x' : ''}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          Créée le {new Date(setlist.dateCreated).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        onClick={() => playSetlist(setlist)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                      >
                        <Play size={14} fill="currentColor" /> Lancer Live
                      </button>
                      <button
                        onClick={() => handleEdit(setlist)}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition-all cursor-pointer"
                        title="Modifier"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(setlist.id!)}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Ligne Inférieure : Liste des morceaux dépliée */}
                  {isExpanded && (
                    <div className="mt-2 pt-4 border-t border-zinc-900/60 flex flex-col gap-2 animate-fade-in">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-1 block">Ordre des morceaux :</span>
                      <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                        {setlist.songIds.map((songId: any, idx: number) => {
                          const song = songs.find(s => String(s.id) === String(songId));
                          if (!song) return null;
                          return (
                            <div key={idx} className="flex items-center justify-between bg-zinc-950/40 border border-zinc-900 px-3 py-2 rounded-xl text-xs">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-[10px] font-bold text-zinc-650 w-4 text-right">{idx + 1}.</span>
                                <span className="font-bold text-zinc-200 truncate">{song.title}</span>
                                <span className="text-zinc-500 truncate text-[11px]">{song.artist}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-[10px]">
                                <span className="text-emerald-400 font-extrabold">{song.bpm} BPM</span>
                                <span className="text-zinc-550 bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-850 font-bold">{song.timeSignature}</span>
                              </div>
                            </div>
                          );
                        })}
                        {setlist.songIds.length === 0 && (
                          <p className="text-xs text-zinc-500 italic py-2">Aucun morceau dans cette setlist. Cliquez sur modifier pour en ajouter.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-zinc-500 glass-panel rounded-2xl border border-zinc-900">
              <ListMusic size={40} className="mx-auto text-zinc-700 mb-3" />
              <p className="font-semibold text-zinc-400">Aucune setlist configurée</p>
              <p className="text-xs text-zinc-600 mt-1">Créez votre première setlist pour enchaîner vos morceaux sur scène.</p>
            </div>
          )}
        </div>
      )}

      {/* Formulaire de création / modification */}
      {isEditing && editingSetlist && (
        <form onSubmit={handleSave} className="glass-panel rounded-2xl p-6 border border-zinc-800 flex flex-col gap-5">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
            <h3 className="font-bold text-lg text-zinc-100">
              {editingSetlist.id ? "Modifier la setlist" : "Créer une nouvelle setlist"}
            </h3>
            <button 
              type="button" 
              onClick={() => setIsEditing(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Colonne de gauche : Infos générales */}
            <div className="md:col-span-1 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400 font-semibold">Nom de la setlist / Concert *</label>
                <input
                  type="text"
                  required
                  value={editingSetlist.title}
                  onChange={(e) => setEditingSetlist({ ...editingSetlist, title: e.target.value })}
                  className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm"
                  placeholder="ex: Live Rock Café 2026"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400 font-semibold">Description</label>
                <textarea
                  rows={4}
                  value={editingSetlist.description || ''}
                  onChange={(e) => setEditingSetlist({ ...editingSetlist, description: e.target.value })}
                  className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-sm resize-none"
                  placeholder="ex: Liste des morceaux avec enchaînements rapides..."
                />
              </div>
            </div>

            {/* Colonne centrale : Morceaux choisis (Ordre) */}
            <div className="md:col-span-1 flex flex-col gap-3">
              <label className="text-xs text-zinc-400 font-semibold">Ordre des morceaux ({editingSetlist.songIds?.length || 0})</label>
              
              <div className="flex flex-col gap-2 overflow-y-auto max-h-[300px] border border-zinc-800 bg-zinc-950/40 p-2.5 rounded-xl min-h-[200px]">
                {editingSetlist.songIds && editingSetlist.songIds.length > 0 ? (
                  editingSetlist.songIds.map((songId, index) => {
                    const song = songs.find(s => s.id === songId);
                    if (!song) return null;
                    return (
                      <div 
                        key={`${songId}-${index}`} 
                        className="bg-zinc-900/80 border border-zinc-850/60 p-2 rounded-lg flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 font-bold bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-850">
                            {index + 1}
                          </span>
                          <div className="truncate">
                            <span className="font-bold text-zinc-200 block truncate">{song.title}</span>
                            <span className="text-[10px] text-zinc-400">{song.artist} ({song.bpm} BPM)</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => moveSong(index, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded bg-zinc-950 border border-zinc-850 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSong(index, 'down')}
                            disabled={index === editingSetlist.songIds!.length - 1}
                            className="p-1 rounded bg-zinc-950 border border-zinc-850 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer"
                          >
                            <ChevronDown size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSongFromSetlist(index)}
                            className="p-1 rounded bg-rose-950/20 border border-rose-900/20 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 cursor-pointer"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-zinc-600 text-xs text-center my-auto">Aucun morceau sélectionné. Cliquez sur un morceau à droite pour l'ajouter.</p>
                )}
              </div>
            </div>

            {/* Colonne de droite : Sélectionner dans la Bibliothèque */}
            <div className="md:col-span-1 flex flex-col gap-3">
              <label className="text-xs text-zinc-400 font-semibold">Ajouter depuis la Bibliothèque</label>
              
              <div className="flex flex-col gap-2 overflow-y-auto max-h-[300px] border border-zinc-850 p-2.5 rounded-xl bg-zinc-950/20">
                {songs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => addSongToSetlist(song.id!)}
                    className="p-2 rounded-lg bg-zinc-900 border border-zinc-900 hover:border-emerald-500/40 text-left text-xs transition-all flex justify-between items-center cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <span className="font-semibold text-zinc-300 block truncate">{song.title}</span>
                      <span className="text-[10px] text-zinc-500 truncate block">{song.artist}</span>
                    </div>
                    <span className="text-emerald-400 font-bold bg-zinc-950 px-2 py-0.5 rounded border border-zinc-850">
                      {song.bpm}
                    </span>
                  </button>
                ))}
              </div>
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
              <Check size={16} /> Enregistrer la setlist
            </button>
          </div>
        </form>
      )}

    </div>
  );
};
