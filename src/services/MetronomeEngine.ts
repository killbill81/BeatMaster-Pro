import { Haptics, ImpactStyle } from '@capacitor/haptics';

export type MetronomeSoundType = 'woodblock' | 'cowbell' | 'synth';
export type SubdivisionType = 'quarter' | 'eighth' | 'sixteenth' | 'triplet';

export interface MetronomeTickInfo {
  beatNumber: number; // Temps actuel dans la mesure (1, 2, 3, etc.)
  subdivisionIndex: number; // Index de la subdivision dans le temps (0, 1, 2, 3)
  time: number; // Temps absolu AudioContext
}

export class MetronomeEngine {
  private audioCtx: AudioContext | null = null;
  private isRunning: boolean = false;

  // Paramètres du métronome
  private bpm: number = 120;
  private beatsPerMeasure: number = 4; // Numérateur de la signature (ex: 4 pour 4/4)
  private subdivision: SubdivisionType = 'quarter';
  private soundType: MetronomeSoundType = 'woodblock';
  private accentFirstBeat: boolean = true;
  private vibrationEnabled: boolean = false;
  private visualFlashEnabled: boolean = true;

  // Compte à rebours
  private isCountingDown: boolean = false;
  private countdownBeatsRemaining: number = 0;
  private onCountdownProgress: ((beatsRemaining: number) => void) | null = null;
  private onCountdownEnd: (() => void) | null = null;

  // Callbacks pour l'UI
  private onTick: ((tickInfo: MetronomeTickInfo) => void) | null = null;

  // Variables internes de l'ordonnanceur (Scheduler)
  private nextTickTime: number = 0.0; // Quand le prochain clic doit avoir lieu
  private currentBeatInMeasure: number = 0; // Quel temps on joue (0 à beatsPerMeasure - 1)
  private currentSubdivision: number = 0; // Quelle subdivision on joue (0 à N-1)
  private lookahead: number = 25.0; // Fréquence de l'appel du scheduler (en ms)
  private scheduleAheadTime: number = 0.1; // Horizon de planification (en secondes)
  private timerId: any = null;

  constructor() {
    // L'AudioContext sera initialisé au premier geste utilisateur pour respecter les politiques des navigateurs.
  }

  private initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Setters et Getters
  public setBpm(newBpm: number) {
    this.bpm = Math.max(30, Math.min(300, newBpm));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setSignature(numerator: number) {
    this.beatsPerMeasure = numerator;
  }

  public setSubdivision(sub: SubdivisionType) {
    this.subdivision = sub;
  }

  public setSoundType(type: MetronomeSoundType) {
    this.soundType = type;
  }

  public setAccentFirstBeat(enabled: boolean) {
    this.accentFirstBeat = enabled;
  }

  public setVibrationEnabled(enabled: boolean) {
    this.vibrationEnabled = enabled;
  }

  public setVisualFlashEnabled(enabled: boolean) {
    this.visualFlashEnabled = enabled;
  }

  public setCallbacks(
    onTick: (tickInfo: MetronomeTickInfo) => void,
    onCountdownProgress?: (beatsRemaining: number) => void,
    onCountdownEnd?: () => void
  ) {
    this.onTick = onTick;
    if (onCountdownProgress) this.onCountdownProgress = onCountdownProgress;
    if (onCountdownEnd) this.onCountdownEnd = onCountdownEnd;
  }

  // Démarrer le métronome
  public start(withCountdown: boolean = false, countdownBeats: number = 4) {
    this.initAudio();
    if (this.isRunning) return;

    this.isRunning = true;
    this.currentBeatInMeasure = 0;
    this.currentSubdivision = 0;
    this.nextTickTime = this.audioCtx!.currentTime + 0.05;

    if (withCountdown) {
      this.isCountingDown = true;
      this.countdownBeatsRemaining = countdownBeats;
      if (this.onCountdownProgress) {
        this.onCountdownProgress(this.countdownBeatsRemaining);
      }
    } else {
      this.isCountingDown = false;
    }

    this.scheduler();
  }

  // Arrêter le métronome
  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.isCountingDown = false;
    clearTimeout(this.timerId);
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getIsCountingDown(): boolean {
    return this.isCountingDown;
  }

  // Récupérer le nombre de ticks de subdivision par temps
  private getSubdivisionTicksCount(): number {
    switch (this.subdivision) {
      case 'eighth': return 2;
      case 'sixteenth': return 4;
      case 'triplet': return 3;
      case 'quarter':
      default: return 1;
    }
  }

  // Planification des clics
  private scheduler() {
    if (!this.isRunning) return;

    // Pendant qu'il y a des notes à planifier avant le prochain intervalle
    while (this.nextTickTime < this.audioCtx!.currentTime + this.scheduleAheadTime) {
      this.scheduleTick(this.currentBeatInMeasure, this.currentSubdivision, this.nextTickTime);
      this.advanceTick();
    }

    // Programmer le prochain appel du scheduler
    this.timerId = setTimeout(() => this.scheduler(), this.lookahead);
  }

  // Avance le temps et les indices de beats/subdivisions
  private advanceTick() {
    const secondsPerBeat = 60.0 / this.bpm;
    const ticksCount = this.getSubdivisionTicksCount();
    const secondsPerTick = secondsPerBeat / ticksCount;

    // Planifier le prochain tick
    this.nextTickTime += secondsPerTick;

    // Avancer la subdivision
    this.currentSubdivision++;
    if (this.currentSubdivision >= ticksCount) {
      this.currentSubdivision = 0;
      this.currentBeatInMeasure++;
      
      // Gérer le compte à rebours
      if (this.isCountingDown) {
        this.countdownBeatsRemaining--;
        if (this.onCountdownProgress) {
          // Utiliser setTimeout pour synchroniser avec l'UI principale en dehors du thread audio
          setTimeout(() => {
            if (this.onCountdownProgress) this.onCountdownProgress(this.countdownBeatsRemaining);
          }, 0);
        }
        
        if (this.countdownBeatsRemaining <= 0) {
          this.isCountingDown = false;
          this.currentBeatInMeasure = 0; // Commencer la mesure réelle
          if (this.onCountdownEnd) {
            setTimeout(() => {
              if (this.onCountdownEnd) this.onCountdownEnd();
            }, 0);
          }
        }
      } else if (this.currentBeatInMeasure >= this.beatsPerMeasure) {
        this.currentBeatInMeasure = 0;
      }
    }
  }

  // Programmer le son de la note et les effets visuels/vibrations
  private scheduleTick(beat: number, subdivisionIndex: number, time: number) {
    if (!this.audioCtx) return;

    // Déterminer s'il s'agit d'un premier temps accentué
    const isFirstBeat = beat === 0 && subdivisionIndex === 0;
    const isMainBeat = subdivisionIndex === 0;

    // Générer le son
    this.playTone(isFirstBeat, isMainBeat, time);

    // Synchroniser les retours haptiques et les callbacks d'UI
    const delay = (time - this.audioCtx.currentTime) * 1000;
    
    setTimeout(() => {
      if (!this.isRunning) return;

      // Déclencher le callback d'UI pour le flash visuel et le beat counter
      if (this.onTick) {
        this.onTick({
          beatNumber: beat + 1,
          subdivisionIndex,
          time
        });
      }

      // Si c'est un temps principal et que la vibration est active
      if (isMainBeat && this.vibrationEnabled) {
        this.triggerVibration(isFirstBeat);
      }
    }, Math.max(0, delay));
  }

  // Synthèse de sons via la Web Audio API
  private playTone(isFirstBeat: boolean, isMainBeat: boolean, time: number) {
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    let frequency = 800; // Fréquence par défaut
    let duration = 0.05; // Durée par défaut en secondes

    // Ajuster selon le son sélectionné
    if (this.soundType === 'woodblock') {
      frequency = isFirstBeat && this.accentFirstBeat ? 1200 : (isMainBeat ? 850 : 600);
      duration = isFirstBeat && this.accentFirstBeat ? 0.04 : 0.03;
      
      // Forme d'onde sinusoïdale modifiée ou triangle pour un son plus boisé
      osc.type = 'triangle';
      
      // Enveloppe d'amplitude rapide
      gainNode.gain.setValueAtTime(0.6, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
    } else if (this.soundType === 'cowbell') {
      // Synthèse de cloche métallique (combinaison de deux fréquences)
      frequency = isFirstBeat && this.accentFirstBeat ? 1000 : (isMainBeat ? 750 : 550);
      duration = 0.12;
      osc.type = 'sawtooth';

      // Filtre passe-bande pour affiner le son de la cloche
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      filter.Q.value = 3.0;

      osc.disconnect(gainNode);
      osc.connect(filter);
      filter.connect(gainNode);

      gainNode.gain.setValueAtTime(0.5, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
    } else { // 'synth' (Bip électronique classique)
      frequency = isFirstBeat && this.accentFirstBeat ? 1500 : (isMainBeat ? 1000 : 750);
      duration = 0.06;
      osc.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
    }

    // Configurer la fréquence de l'oscillateur
    osc.frequency.setValueAtTime(frequency, time);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  // Déclencher la vibration sur mobile
  private async triggerVibration(isFirstBeat: boolean) {
    try {
      if (isFirstBeat && this.accentFirstBeat) {
        // Vibration plus forte sur le 1er temps
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else {
        // Vibration légère pour les autres temps
        await Haptics.impact({ style: ImpactStyle.Light });
      }
    } catch (e) {
      // Échoue silencieusement si les haptiques ne sont pas supportées (ex: navigateur web de bureau)
      if ('vibrate' in navigator) {
        navigator.vibrate(isFirstBeat ? 60 : 30);
      }
    }
  }
}
