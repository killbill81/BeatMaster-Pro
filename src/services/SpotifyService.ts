export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtUrl?: string;
  durationMs: number;
  spotifyUrl: string;
}

export interface SpotifyAudioFeatures {
  bpm: number;
  timeSignature: string;
  key: string;
}

export class SpotifyService {
  private static clientIdKey = 'drumpilot_spotify_client_id';
  private static tokenKey = 'drumpilot_spotify_token_data';
  private static codeVerifierKey = 'drumpilot_spotify_code_verifier';

  // Récupérer le Client ID stocké localement
  public static getClientId(): string {
    return localStorage.getItem(this.clientIdKey) || '';
  }

  // Stocker le Client ID localement
  public static setClientId(clientId: string) {
    localStorage.setItem(this.clientIdKey, clientId.trim());
  }

  // Récupérer l'URI de redirection exact généré par l'application courante
  public static getRedirectUri(): string {
    // Normaliser l'URI pour éviter les divergences (ex: index.html manquant ou présent)
    let uri = window.location.origin + window.location.pathname;
    if (!uri.endsWith('/')) {
      // S'assurer que ça se termine par un slash si ce n'est pas le cas
      if (uri.endsWith('.html')) {
        // Garder le chemin complet du fichier sur mobile/émulateur
      } else {
        uri += '/';
      }
    }
    return uri;
  }

  // Vérifier si l'utilisateur est connecté à Spotify
  public static isAuthenticated(): boolean {
    const tokenData = this.getTokenData();
    if (!tokenData) return false;
    // Vérifier si le token n'a pas expiré (avec une marge de 1 minute)
    return Date.now() < tokenData.expiresAt - 60000;
  }

  // Lancer le flux d'authentification PKCE
  public static async login() {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error("Client ID manquant. Veuillez le configurer dans les paramètres.");
    }

    const redirectUri = this.getRedirectUri();
    const codeVerifier = this.generateRandomString(64);
    localStorage.setItem(this.codeVerifierKey, codeVerifier);

    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    
    const scope = 'user-read-private user-read-email';
    const authUrl = new URL("https://accounts.spotify.com/authorize");

    const params = {
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
    };

    authUrl.search = new URLSearchParams(params).toString();
    // Redirection vers Spotify pour l'autorisation
    window.location.href = authUrl.toString();
  }

  // Traiter le code de retour après redirection Spotify
  public static async handleCallback(): Promise<boolean> {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) return false;

    const clientId = this.getClientId();
    const codeVerifier = localStorage.getItem(this.codeVerifierKey);
    const redirectUri = this.getRedirectUri();

    if (!codeVerifier) {
      console.error("Code verifier manquant dans le localStorage");
      return false;
    }

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la récupération du token");
      }

      const data = await response.json();
      this.saveTokenData(data.access_token, data.expires_in);

      // Nettoyer l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
      localStorage.removeItem(this.codeVerifierKey);
      return true;
    } catch (error) {
      console.error("Échec de l'authentification Spotify", error);
      return false;
    }
  }

  // Déconnexion
  public static logout() {
    localStorage.removeItem(this.tokenKey);
  }

  // Recherche de morceaux
  public static async searchTracks(query: string): Promise<SpotifyTrack[]> {
    if (!this.isAuthenticated()) {
      throw new Error("Authentification Spotify requise");
    }

    const token = this.getAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=8`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      this.logout();
      throw new Error("Session Spotify expirée. Veuillez vous reconnecter.");
    }

    if (!response.ok) {
      throw new Error("Erreur lors de la recherche Spotify");
    }

    const data = await response.json();
    return data.tracks.items.map((item: any) => ({
      id: item.id,
      title: item.name,
      artist: item.artists.map((a: any) => a.name).join(', '),
      album: item.album.name,
      albumArtUrl: item.album.images?.[0]?.url || item.album.images?.[1]?.url,
      durationMs: item.duration_ms,
      spotifyUrl: item.external_urls.spotify,
    }));
  }

  // Obtenir le BPM, Tonalité et Signature
  public static async getAudioFeatures(trackId: string): Promise<SpotifyAudioFeatures> {
    if (!this.isAuthenticated()) {
      throw new Error("Authentification Spotify requise");
    }

    const token = this.getAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erreur ${response.status} (Restrictions API Spotify)`);
    }

    const data = await response.json();
    
    // Formater la signature rythmique
    const timeSig = `${data.time_signature}/4`;

    // Convertir la tonalité
    const formattedKey = this.convertKeyToText(data.key, data.mode);

    return {
      bpm: Math.round(data.tempo),
      timeSignature: timeSig,
      key: formattedKey,
    };
  }

  // Secours automatique via GetSongBPM API
  public static async getAudioFeaturesFallback(title: string, artist: string): Promise<SpotifyAudioFeatures | null> {
    const apiKey = localStorage.getItem('drumpilot_getsongbpm_api_key');
    if (!apiKey) return null;

    try {
      // Étape 1 : Recherche de la chanson sur GetSongBPM (URL officielle api.getsong.co)
      const cleanArtist = artist.split(',')[0].trim();
      const lookupValue = `song:${title.trim()} artist:${cleanArtist}`;
      
      const searchResponse = await fetch(`https://api.getsong.co/search/?api_key=${apiKey}&type=both&lookup=${encodeURIComponent(lookupValue)}`);
      if (!searchResponse.ok) {
        throw new Error(`Erreur HTTP GetSongBPM ${searchResponse.status}`);
      }
      
      const searchData = await searchResponse.json();
      if (!searchData.search || searchData.search.length === 0) {
        return null;
      }
      
      const songId = searchData.search[0].id;
      
      // Étape 2 : Récupérer les détails de la chanson (BPM et Clé)
      const songResponse = await fetch(`https://api.getsong.co/song/?api_key=${apiKey}&id=${songId}`);
      if (!songResponse.ok) {
        return null;
      }
      
      const songData = await songResponse.json();
      if (!songData.song) return null;
      
      const bpm = parseInt(songData.song.tempo, 10) || 0;
      const keyOfSong = songData.song.key_of || ''; // ex: "A min" ou "C Maj"
      
      let formattedKey = keyOfSong;
      if (keyOfSong.toLowerCase().includes('min')) {
        formattedKey = keyOfSong.split(' ')[0] + ' Minor';
      } else if (keyOfSong.toLowerCase().includes('maj')) {
        formattedKey = keyOfSong.split(' ')[0] + ' Major';
      }

      // Lire la signature rythmique si disponible (ex: "4/4" ou entier 4)
      let timeSig = songData.song.time_sig || '4/4';
      if (typeof timeSig === 'number' || (typeof timeSig === 'string' && !timeSig.includes('/'))) {
        timeSig = `${timeSig}/4`;
      }

      return {
        bpm,
        timeSignature: timeSig,
        key: formattedKey
      };
    } catch (e) {
      console.error("Échec du secours GetSongBPM :", e);
      return null;
    }
  }

  // Utilitaires de conversion
  public static formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private static convertKeyToText(key: number, mode: number): string {
    if (key === -1) return '';

    const keysMap = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const keyName = keysMap[key] || '';
    const modeName = mode === 1 ? 'Major' : 'Minor';

    return `${keyName} ${modeName}`;
  }

  // Helpers PKCE
  private static generateRandomString(length: number): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values).map((x) => possible[x % possible.length]).join('');
  }

  private static async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  // Helpers Tokens
  private static saveTokenData(accessToken: string, expiresIn: number) {
    const expiresAt = Date.now() + expiresIn * 1000;
    localStorage.setItem(this.tokenKey, JSON.stringify({ accessToken, expiresAt }));
  }

  private static getTokenData(): { accessToken: string; expiresAt: number } | null {
    const data = localStorage.getItem(this.tokenKey);
    return data ? JSON.parse(data) : null;
  }

  private static getAccessToken(): string {
    const data = this.getTokenData();
    return data ? data.accessToken : '';
  }
}
