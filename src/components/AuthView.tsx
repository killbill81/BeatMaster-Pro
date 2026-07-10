import React, { useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  User,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, isFirebaseConfigured, FirebaseService } from '../services/FirebaseService';
import { LogIn, UserPlus, LogOut, RefreshCw, AlertTriangle, ShieldCheck, Mail, Key, Sparkles, Database } from 'lucide-react';

interface AuthViewProps {
  onAuthChange?: (user: User | null) => void;
  onSyncComplete?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthChange, onSyncComplete }) => {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // États de synchronisation
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncDate, setLastSyncDate] = useState<string>(
    localStorage.getItem('drumpilot_last_sync') || 'Jamais'
  );

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return;

    // Écouter les changements de session Firebase
    const unsubscribe = onAuthStateChanged(auth, (currentUser: User | null) => {
      setUser(currentUser);
      if (onAuthChange) onAuthChange(currentUser);
      
      // Lancer une synchronisation automatique si l'utilisateur vient de se connecter
      if (currentUser) {
        triggerSync(currentUser);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured || !auth) return;

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isRegistering) {
        // Inscription
        await createUserWithEmailAndPassword(auth, email, password);
        setSuccessMsg("Compte créé avec succès ! Synchronisation en cours...");
      } else {
        // Connexion
        await signInWithEmailAndPassword(auth, email, password);
        setSuccessMsg("Connexion réussie ! Synchronisation en cours...");
      }
      setEmail('');
      setPassword('');
    } catch (err: any) {
      console.error(err);
      // Traduire les erreurs Firebase en français simple
      let msg = err.message;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = "Identifiants ou mot de passe incorrects.";
      } else if (err.code === 'auth/email-already-in-use') {
        msg = "Cet e-mail est déjà associé à un compte.";
      } else if (err.code === 'auth/weak-password') {
        msg = "Le mot de passe doit contenir au moins 6 caractères.";
      } else if (err.code === 'auth/invalid-email') {
        msg = "Adresse e-mail invalide.";
      }
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setSuccessMsg("Déconnecté avec succès.");
      setErrorMsg('');
    } catch (err: any) {
      setErrorMsg("Erreur lors de la déconnexion : " + err.message);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMsg("Veuillez saisir votre adresse e-mail dans le champ pour réinitialiser le mot de passe.");
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg("E-mail de réinitialisation envoyé ! Vérifiez votre boîte de réception.");
    } catch (err: any) {
      setErrorMsg("Erreur : " + err.message);
    }
  };

  const triggerSync = async (currentUser: User) => {
    if (!isFirebaseConfigured || isSyncing) return;
    setIsSyncing(true);
    setErrorMsg('');
    try {
      const result = await FirebaseService.synchronize(currentUser);
      const dateStr = new Date().toLocaleString();
      localStorage.setItem('drumpilot_last_sync', dateStr);
      setLastSyncDate(dateStr);
      setSuccessMsg(`Synchronisation réussie ! (${result.songsSynced} morceaux/setlists mis à jour)`);
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      setErrorMsg("Erreur de synchronisation Cloud : " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- RENDU SI FIREBASE NON CONFIGURÉ ---
  if (!isFirebaseConfigured) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-zinc-900 flex flex-col gap-4 max-w-md mx-auto">
        <div className="flex items-center gap-2 text-amber-500">
          <AlertTriangle size={24} />
          <h3 className="font-extrabold text-sm uppercase tracking-wider text-zinc-100">Firebase non configuré</h3>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Pour activer la synchronisation de vos morceaux dans le Cloud et les partager sur votre Pixel 10, vous devez renseigner le fichier <strong>.env</strong> situé à la racine du projet.
        </p>
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 flex flex-col gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Procédure :</span>
          <ol className="list-decimal pl-4 text-[10px] text-zinc-400 space-y-1">
            <li>Créez un projet sur la console Firebase.</li>
            <li>Activez Firestore et l'authentification par E-mail.</li>
            <li>Copiez la config et collez-la dans le fichier <code className="text-emerald-400 font-mono">.env</code> de votre dossier local.</li>
            <li>Redémarrez le serveur avec <code className="text-zinc-200 bg-zinc-900 px-1 rounded font-mono">npm run dev</code>.</li>
          </ol>
        </div>
      </div>
    );
  }

  // --- RENDU SI CONNECTÉ ---
  if (user) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-zinc-900 flex flex-col gap-5 max-w-md mx-auto">
        
        {/* En-tête Utilisateur connecté */}
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h3 className="font-bold text-xs text-zinc-200 truncate max-w-[180px]" title={user.email || ''}>
                {user.email}
              </h3>
              <span className="text-[9px] text-emerald-400 font-bold block uppercase tracking-wider">Synchronisé</span>
            </div>
          </div>

          <button 
            onClick={handleLogout}
            className="p-2 bg-zinc-900 border border-zinc-850 hover:bg-rose-950/20 hover:border-rose-900/20 hover:text-rose-400 text-zinc-400 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
          >
            <LogOut size={14} /> Déconnexion
          </button>
        </div>

        {/* Section de Synchronisation */}
        <div className="flex flex-col gap-3.5 bg-zinc-950/40 p-4 rounded-xl border border-zinc-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <Database size={16} />
              <span className="text-xs font-semibold">Sauvegarde Cloud</span>
            </div>
            <button
              onClick={() => triggerSync(user)}
              disabled={isSyncing}
              className={`p-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 rounded-lg shadow-md transition-all cursor-pointer ${
                isSyncing ? 'animate-spin' : ''
              }`}
              title="Forcer la synchronisation"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-1 text-[10px]">
            <div className="flex justify-between text-zinc-500">
              <span>Dernière synchronisation :</span>
              <span className="text-zinc-300 font-bold">{lastSyncDate}</span>
            </div>
            <p className="text-zinc-500 mt-1 leading-normal">
              Vos morceaux et setlists locaux sont automatiquement fusionnés avec votre espace privé en ligne.
            </p>
          </div>
        </div>

        {/* Messages de retour */}
        {successMsg && <p className="text-[10px] text-emerald-400 bg-emerald-500/5 p-2 rounded border border-emerald-500/10 text-center font-semibold">{successMsg}</p>}
        {errorMsg && <p className="text-[10px] text-rose-400 bg-rose-500/5 p-2 rounded border border-rose-500/10 text-center font-semibold">{errorMsg}</p>}

      </div>
    );
  }

  // --- RENDU SI DÉCONNECTÉ (Formulaire de Connexion) ---
  return (
    <div className="glass-panel rounded-2xl p-6 border border-zinc-900 flex flex-col gap-5 max-w-md mx-auto">
      <div className="text-center">
        <h3 className="font-extrabold text-base text-zinc-100 flex items-center justify-center gap-2">
          <Sparkles className="text-emerald-400" size={16} /> 
          {isRegistering ? "Créer un compte Cloud" : "Se connecter à DrumPilot"}
        </h3>
        <p className="text-[10px] text-zinc-500 mt-1">
          {isRegistering 
            ? "Sauvegardez vos morceaux et accédez-y sur tous vos écrans." 
            : "Connectez-vous pour retrouver et synchroniser votre bibliothèque."}
        </p>
      </div>

      <form onSubmit={handleAuth} className="flex flex-col gap-4">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Adresse E-mail</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-650">
              <Mail size={14} />
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-xs"
              placeholder="votre.email@exemple.com"
            />
          </div>
        </div>

        {/* Mot de passe */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Mot de passe</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-650">
              <Key size={14} />
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-850 rounded-xl focus:outline-none focus:border-emerald-500 text-zinc-200 text-xs"
              placeholder="••••••••"
            />
          </div>
        </div>

        {/* Boutons d'Action */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/20 cursor-pointer disabled:opacity-50 transition-all mt-1"
        >
          {isRegistering ? (
            <>
              <UserPlus size={14} /> Créer mon compte
            </>
          ) : (
            <>
              <LogIn size={14} /> Se connecter
            </>
          )}
        </button>

        {/* Liens de bascule */}
        <div className="flex justify-between items-center text-[10px] text-zinc-500 pt-2 border-t border-zinc-900">
          {!isRegistering && (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="hover:text-zinc-400 underline cursor-pointer"
            >
              Mot de passe oublié ?
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="hover:text-zinc-400 font-bold text-emerald-400 underline ml-auto cursor-pointer"
          >
            {isRegistering ? "J'ai déjà un compte" : "Créer un compte gratuit"}
          </button>
        </div>
      </form>

      {/* Messages de retour */}
      {successMsg && <p className="text-[10px] text-emerald-400 bg-emerald-500/5 p-2 rounded border border-emerald-500/10 text-center font-semibold">{successMsg}</p>}
      {errorMsg && <p className="text-[10px] text-rose-400 bg-rose-500/5 p-2 rounded border border-rose-500/10 text-center font-semibold">{errorMsg}</p>}

    </div>
  );
};
