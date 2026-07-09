import Dexie, { type Table } from 'dexie';

export interface Song {
  id?: number;
  title: string;
  artist: string;
  album?: string;
  bpm: number;
  timeSignature: string; // ex: "4/4", "3/4", "6/8"
  key?: string; // ex: "A Minor", "C Major"
  duration?: string; // ex: "3:45"
  comments?: string;
  tags: string[];
  color?: string; // code hexadécimal de couleur associée
  favorite: boolean;
  spotifyUrl?: string;
  youtubeUrl?: string;
  difficulty?: number; // 1 à 5
  structure?: string; // ex: "Intro[4], Couplet[8], Refrain[8], Couplet[8], Refrain[8], Outro[4]" ou structure sous forme de chaîne de caractères
  dateAdded: Date;
}

export interface Setlist {
  id?: number;
  title: string;
  description?: string;
  songIds: number[]; // IDs des morceaux dans l'ordre de passage
  dateCreated: Date;
}

class DrumPilotDatabase extends Dexie {
  songs!: Table<Song, number>;
  setlists!: Table<Setlist, number>;

  constructor() {
    super('DrumPilotDatabase');
    this.version(1).stores({
      songs: '++id, title, artist, bpm, favorite, *tags, dateAdded',
      setlists: '++id, title, dateCreated'
    });
  }
}

export const db = new DrumPilotDatabase();

// Ajouter des données de démonstration initiales si la base est vide
export async function seedDatabaseIfEmpty() {
  const songCount = await db.songs.count();
  if (songCount === 0) {
    const demoSongs: Song[] = [
      {
        title: "Back in Black",
        artist: "AC/DC",
        album: "Back in Black",
        bpm: 93,
        timeSignature: "4/4",
        key: "E Major",
        duration: "4:15",
        comments: "Gros beat binaire solide. Attention au break de batterie avant le solo.",
        tags: ["Rock", "Binaire", "Classique"],
        color: "#ef4444", // rouge
        favorite: true,
        youtubeUrl: "https://www.youtube.com/watch?v=pAgnJDJN4VA",
        difficulty: 2,
        structure: "Intro [8] - Couplet [8] - Refrain [8] - Couplet [8] - Refrain [8] - Solo [16] - Refrain [8] - Outro [8]",
        dateAdded: new Date()
      },
      {
        title: "Master of Puppets",
        artist: "Metallica",
        album: "Master of Puppets",
        bpm: 220,
        timeSignature: "4/4",
        key: "E Minor",
        duration: "8:35",
        comments: "Double pédale rapide sur les refrains. Changements de signature (5/8, 2/4) pendant le pont solo.",
        tags: ["Metal", "Double Pédale", "Technique"],
        color: "#f97316", // orange
        favorite: true,
        youtubeUrl: "https://www.youtube.com/watch?v=xnKhsTXoK2I",
        difficulty: 5,
        structure: "Intro [12] - Couplet [16] - Refrain [8] - Couplet [16] - Refrain [8] - Intermède [12] - Solo Intermédiaire [16] - Pont [16] - Solo [24] - Couplet [16] - Refrain [8] - Outro [16]",
        dateAdded: new Date()
      },
      {
        title: "Take Five",
        artist: "Dave Brubeck",
        album: "Time Out",
        bpm: 174,
        timeSignature: "5/4",
        key: "Eb Minor",
        duration: "5:24",
        comments: "Signature rythmique en 5/4. Feeling jazz swing cool. Grand solo de batterie au milieu avec ostinato de piano.",
        tags: ["Jazz", "Impair", "Swing"],
        color: "#3b82f6", // bleu
        favorite: false,
        youtubeUrl: "https://www.youtube.com/watch?v=tT9Eh8wF96g",
        difficulty: 4,
        structure: "Thème A [8] - Thème B [8] - Solo de Batterie [64] - Thème A [8] - Outro [4]",
        dateAdded: new Date()
      },
      {
        title: "Rosanna",
        artist: "Toto",
        album: "Toto IV",
        bpm: 82,
        timeSignature: "4/4",
        key: "G Major",
        duration: "5:31",
        comments: "Le célèbre Half-Time Shuffle de Jeff Porcaro (Rosanna Shuffle). Ghost notes cruciales sur la caisse claire !",
        tags: ["Pop-Rock", "Shuffle", "Ghost Notes"],
        color: "#10b981", // émeraude
        favorite: true,
        youtubeUrl: "https://www.youtube.com/watch?v=qmOLt1V16n0",
        difficulty: 4,
        structure: "Intro [4] - Couplet [8] - Pré-Refrain [4] - Refrain [8] - Couplet [8] - Pré-Refrain [4] - Refrain [8] - Solo Clavier [8] - Refrain [8] - Solo Guitare / Outro [16]",
        dateAdded: new Date()
      },
      {
        title: "Come Together",
        artist: "The Beatles",
        album: "Abbey Road",
        bpm: 83,
        timeSignature: "4/4",
        key: "D Minor",
        duration: "4:20",
        comments: "Pattern de toms signature de Ringo Starr. Jouer lâche et précis.",
        tags: ["Rock", "Groove", "Classique"],
        color: "#a855f7", // violet
        favorite: false,
        youtubeUrl: "https://www.youtube.com/watch?v=45cYwDMibGo",
        difficulty: 2,
        structure: "Intro [4] - Couplet [8] - Refrain [4] - Couplet [8] - Refrain [4] - Solo [8] - Couplet [8] - Refrain [4] - Outro [12]",
        dateAdded: new Date()
      }
    ];

    await db.songs.bulkAdd(demoSongs);

    const demoSetlist: Setlist = {
      title: "Répétition Concert d'Été",
      description: "Setlist principale pour les répétitions de juillet 2026",
      songIds: [1, 4, 5, 2], // Back in Black, Rosanna, Come Together, Master of Puppets
      dateCreated: new Date()
    };

    await db.setlists.add(demoSetlist);
  }
}
