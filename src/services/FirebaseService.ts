import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  writeBatch,
  query,
  where
} from 'firebase/firestore';
import { db, Song, Setlist } from '../db/database';

// Configuration récupérée depuis les variables d'environnement Vite
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Vérifier si la config est complète
const isFirebaseConfigured = !!(
  firebaseConfig.apiKey && 
  firebaseConfig.projectId && 
  firebaseConfig.appId
);

let app: any = null;
let auth: any = null;
let firestore: any = null;

if (isFirebaseConfigured) {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
    auth = getAuth(app);
    firestore = getFirestore(app);
  } catch (error) {
    console.error("Erreur d'initialisation Firebase :", error);
  }
} else {
  console.warn("Firebase n'est pas configuré. Veuillez renseigner le fichier .env");
}

export { auth, firestore, isFirebaseConfigured };

export class FirebaseService {
  
  // Lancer la synchronisation bidirectionnelle
  public static async synchronize(user: User): Promise<{ songsSynced: number; setlistsSynced: number }> {
    if (!isFirebaseConfigured || !firestore) {
      throw new Error("Firebase non configuré.");
    }

    const userId = user.uid;
    let songsSyncedCount = 0;
    let setlistsSyncedCount = 0;

    try {
      // --- 1. SYNCHRONISATION DES MORCEAUX ---
      const localSongs = await db.songs.toArray();
      
      // Récupérer les morceaux du Cloud Firestore
      const cloudSongsCol = collection(firestore, 'users', userId, 'songs');
      const cloudSongsSnapshot = await getDocs(cloudSongsCol);
      const cloudSongs = cloudSongsSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id // Utiliser l'ID document Firestore
      })) as any[];

      // Fusionner Local -> Cloud
      const batch = writeBatch(firestore);
      for (const localSong of localSongs) {
        // Chercher si le morceau local existe déjà sur le cloud (par titre/artiste)
        const matchedCloud = cloudSongs.find(
          cs => cs.title.toLowerCase() === localSong.title.toLowerCase() && 
                cs.artist.toLowerCase() === localSong.artist.toLowerCase()
        );

        if (!matchedCloud) {
          // Nouveau morceau local non présent sur le cloud -> On le push sur le cloud
          // On génère une ID string aléatoire pour Firestore
          const newDocRef = doc(collection(firestore, 'users', userId, 'songs'));
          
          // Nettoyer localSong de son ID incrémental IndexedDB pour Firestore
          const { id, ...cloudData } = localSong;
          batch.set(newDocRef, {
            ...cloudData,
            dateAdded: localSong.dateAdded.toISOString(), // Convertir date pour Firestore
            localId: id // Garder l'ID local en référence
          });
          songsSyncedCount++;
        }
      }
      await batch.commit();

      // Fusionner Cloud -> Local
      // Re-récupérer après push pour avoir la liste complète à jour
      const updatedCloudSongsSnapshot = await getDocs(cloudSongsCol);
      const updatedCloudSongs = updatedCloudSongsSnapshot.docs.map(doc => ({
        ...doc.data(),
        firebaseId: doc.id
      })) as any[];

      for (const cloudSong of updatedCloudSongs) {
        const matchedLocal = localSongs.find(
          ls => ls.title.toLowerCase() === cloudSong.title.toLowerCase() && 
                ls.artist.toLowerCase() === cloudSong.artist.toLowerCase()
        );

        if (!matchedLocal) {
          // Morceau présent sur le cloud mais absent en local -> On l'importe
          const newLocalSong: Song = {
            title: cloudSong.title,
            artist: cloudSong.artist,
            album: cloudSong.album || '',
            bpm: cloudSong.bpm,
            timeSignature: cloudSong.timeSignature,
            key: cloudSong.key || '',
            duration: cloudSong.duration || '',
            comments: cloudSong.comments || '',
            tags: cloudSong.tags || [],
            color: cloudSong.color || '#3b82f6',
            favorite: cloudSong.favorite || false,
            difficulty: cloudSong.difficulty || 3,
            structure: cloudSong.structure || '',
            spotifyUrl: cloudSong.spotifyUrl || '',
            youtubeUrl: cloudSong.youtubeUrl || '',
            dateAdded: new Date(cloudSong.dateAdded)
          };
          await db.songs.add(newLocalSong);
          songsSyncedCount++;
        }
      }

      // --- 2. SYNCHRONISATION DES SETLISTS ---
      // Re-charger les morceaux locaux après importation pour garantir les correspondances d'IDs
      const reloadedLocalSongs = await db.songs.toArray();
      const localSetlists = await db.setlists.toArray();
      
      const cloudSetlistsCol = collection(firestore, 'users', userId, 'setlists');
      const cloudSetlistsSnapshot = await getDocs(cloudSetlistsCol);
      const cloudSetlists = cloudSetlistsSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as any[];

      // Fusionner Local -> Cloud
      const setlistBatch = writeBatch(firestore);
      for (const localSetlist of localSetlists) {
        const matchedCloud = cloudSetlists.find(
          cs => cs.title.toLowerCase() === localSetlist.title.toLowerCase()
        );

        if (!matchedCloud) {
          // Push la setlist locale vers Firestore
          // Pour que la setlist soit cohérente sur le Cloud, on va traduire les IDs locaux de morceaux en couples (Titre, Artiste)
          // afin de pouvoir retrouver les bons IDs lors de l'importation sur un autre PC.
          const songDetails = localSetlist.songIds.map(id => {
            const song = reloadedLocalSongs.find(s => s.id === id);
            return song ? { title: song.title, artist: song.artist } : null;
          }).filter(Boolean);

          const newDocRef = doc(collection(firestore, 'users', userId, 'setlists'));
          const { id, ...cloudData } = localSetlist;
          
          setlistBatch.set(newDocRef, {
            ...cloudData,
            songDetails, // Liste des morceaux identifiables
            dateCreated: localSetlist.dateCreated.toISOString()
          });
          setlistsSyncedCount++;
        }
      }
      await setlistBatch.commit();

      // Fusionner Cloud -> Local
      const updatedCloudSetlistsSnapshot = await getDocs(cloudSetlistsCol);
      const updatedCloudSetlists = updatedCloudSetlistsSnapshot.docs.map(doc => doc.data()) as any[];

      for (const cloudSetlist of updatedCloudSetlists) {
        const matchedLocal = localSetlists.find(
          ls => ls.title.toLowerCase() === cloudSetlist.title.toLowerCase()
        );

        if (!matchedLocal) {
          // Importer la setlist du Cloud en résolvant les IDs locaux à partir des détails (Titre, Artiste)
          const resolvedSongIds: number[] = cloudSetlist.songDetails.map((details: any) => {
            const song = reloadedLocalSongs.find(
              s => s.title.toLowerCase() === details.title.toLowerCase() && 
                    s.artist.toLowerCase() === details.artist.toLowerCase()
            );
            return song ? song.id : null;
          }).filter((id: any): id is number => id !== null);

          const newLocalSetlist: Setlist = {
            title: cloudSetlist.title,
            description: cloudSetlist.description || '',
            songIds: resolvedSongIds,
            dateCreated: new Date(cloudSetlist.dateCreated)
          };
          await db.setlists.add(newLocalSetlist);
          setlistsSyncedCount++;
        }
      }

      return {
        songsSynced: songsSyncedCount,
        setlistsSynced: setlistsSyncedCount
      };

    } catch (error) {
      console.error("Échec de la synchronisation Firebase :", error);
      throw error;
    }
  }
}
