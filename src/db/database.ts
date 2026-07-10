import Dexie, { type Table } from 'dexie';
import initialSongs from './songs.json';

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
  const hasSeeded = localStorage.getItem('drumpilot_db_seeded') === 'true';
  if (hasSeeded) return;

  const songCount = await db.songs.count();
  if (songCount === 0) {
    const songsToSeed: Song[] = initialSongs.map((song: any) => ({
      ...song,
      dateAdded: new Date()
    }));

    await db.songs.bulkAdd(songsToSeed);

    const demoSetlist: Setlist = {
      title: "Répétition Concert d'Été",
      description: "Setlist principale pour les répétitions de juillet 2026",
      songIds: [1, 4, 5, 2], // Back in Black, Rosanna, Come Together, Master of Puppets
      dateCreated: new Date()
    };

    await db.setlists.add(demoSetlist);
  }
  
  localStorage.setItem('drumpilot_db_seeded', 'true');
}
