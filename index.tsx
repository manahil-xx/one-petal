import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Moon, Sun, Heart, Trash2, CheckCircle2, X, AlertCircle, 
  Sparkles, Volume2, VolumeX, Bell, BellOff 
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
type FlowerType = 
  | 'SoftHibiscus' | 'DeepLily' | 'WhiteRose' 
  | 'WhiteLily' | 'PinkLily' | 'Lavender' 
  | 'BlueFlower' | 'Magnolia' | 'YellowHibiscus';

interface FlowerData {
  id: string;
  type: FlowerType;
  color: string;
  icon: string;
}

interface UserProgress {
  lastVisitDate: string | null;
  lastNoteDate: string | null;
  collectedFlowers: FlowerType[];
  streak: number;
  favorites: string[];
  shownNotes: string[];
  remindersEnabled: boolean;
}

// --- Constants ---
const FLOWERS: Record<FlowerType, FlowerData> = {
  SoftHibiscus: { id: '1', type: 'SoftHibiscus', color: '#fdf2f8', icon: '🌸' },
  DeepLily: { id: '2', type: 'DeepLily', color: '#fff1f2', icon: '🌺' },
  WhiteRose: { id: '3', type: 'WhiteRose', color: '#fafaf9', icon: '🌹' },
  WhiteLily: { id: '4', type: 'WhiteLily', color: '#f8fafc', icon: '🌷' },
  PinkLily: { id: '5', type: 'PinkLily', color: '#fee2e2', icon: '💮' },
  Lavender: { id: '6', type: 'Lavender', color: '#f5f3ff', icon: '🪻' },
  BlueFlower: { id: '7', type: 'BlueFlower', color: '#f0f9ff', icon: '💠' },
  Magnolia: { id: '8', type: 'Magnolia', color: '#fef3c7', icon: '🌼' },
  YellowHibiscus: { id: '9', type: 'YellowHibiscus', color: '#fffde7', icon: '🌻' },
};

const FLOWER_LIST: FlowerType[] = [
  'SoftHibiscus', 'DeepLily', 'WhiteRose', 
  'WhiteLily', 'PinkLily', 'Lavender', 
  'BlueFlower', 'Magnolia', 'YellowHibiscus'
];

const CALMING_NOTES = [
  "You’re allowed to slow down.", "Breathe. This moment will pass.",
  "You are doing better than you think.", "Rest is productive too.",
  "It’s okay to feel tired.", "You don’t need to rush your healing.",
  "Small steps still count.", "Your feelings are valid.",
  "You are not a burden.", "Peace begins with one deep breath.",
  "Today doesn’t define you.", "You are enough as you are.",
  "Let yourself be human.", "It’s okay to pause.",
  "You don’t have to prove anything.", "Softness is strength.",
  "You’re learning, not failing.", "Be gentle with your heart.",
  "You deserve kindness—especially from yourself.", "Healing isn’t linear.",
  "One day at a time is enough.", "You’re allowed to let go.",
  "Calm looks good on you.", "Your pace is valid.",
  "You are safe in this moment.", "Progress can be quiet.",
  "Trust yourself a little more.", "You don’t need permission to rest.",
  "It’s okay to start again.", "You matter, even on hard days.",
  "Breathe in calm, breathe out tension.", "You are growing, even here.",
  "Peace comes in small moments.", "You don’t have to carry everything."
];

const INITIAL_PROGRESS: UserProgress = {
  lastVisitDate: null,
  lastNoteDate: null,
  collectedFlowers: [],
  streak: 0,
  favorites: [],
  shownNotes: [],
  remindersEnabled: false,
};

// --- Services ---
class SoundService {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) this.ctx = new AudioContextClass();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted: boolean) { this.isMuted = muted; }

  private createOsc(freq: number, type: OscillatorType = 'sine') {
    this.init();
    if (!this.ctx || this.isMuted) return null;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    return { osc, gain, now: this.ctx.currentTime };
  }

  playTap() {
    const s = this.createOsc(440);
    if (!s) return;
    s.gain.gain.setValueAtTime(0, s.now);
    s.gain.gain.linearRampToValueAtTime(0.1, s.now + 0.01);
    s.gain.gain.exponentialRampToValueAtTime(0.001, s.now + 0.3);
    s.osc.start(); s.osc.stop(s.now + 0.3);
  }

  playBloom() {
    const s = this.createOsc(880);
    if (!s) return;
    s.gain.gain.setValueAtTime(0, s.now);
    s.gain.gain.linearRampToValueAtTime(0.05, s.now + 0.1);
    s.gain.gain.exponentialRampToValueAtTime(0.001, s.now + 1);
    s.osc.start(); s.osc.stop(s.now + 1);
  }
  
  playCalm() {
    const s = this.createOsc(261.63, 'triangle');
    if (!s) return;
    s.gain.gain.setValueAtTime(0, s.now);
    s.gain.gain.linearRampToValueAtTime(0.08, s.now + 1.5);
    s.gain.gain.linearRampToValueAtTime(0, s.now + 4);
    s.osc.start(); s.osc.stop(s.now + 4);
  }

  playSave() {
    const s = this.createOsc(659.25);
    if (!s) return;
    s.gain.gain.setValueAtTime(0, s.now);
    s.gain.gain.linearRampToValueAtTime(0.05, s.now + 0.01);
    s.gain.gain.exponentialRampToValueAtTime(0.001, s.now + 0.2);
    s.osc.start(); s.osc.stop(s.now + 0.2);
  }
}

const soundService = new SoundService();

async function selectBestNote(flowerType: string, availableNotes: string[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `User picked a "${flowerType}" flower. Choose one comforting note from this list that matches the vibe. Return ONLY the text.
      LIST: ${availableNotes.join("\n")}`,
      config: { temperature: 0.7 }
    });
    const selected = response.text?.trim() || "";
    return availableNotes.includes(selected) ? selected : availableNotes[0];
  } catch {
    return availableNotes[Math.floor(Math.random() * availableNotes.length)];
  }
}

// --- Components ---
const Bouquet: React.FC<{ collectedFlowers: FlowerType[], newArrival: boolean }> = ({ collectedFlowers, newArrival }) => {
  return (
    <div className="relative flex items-center justify-center">
      <div className={`relative w-24 h-24 md:w-32 md:h-32 flex items-center justify-center bg-white/20 backdrop-blur-md rounded-full border border-white/40 shadow-sm p-2 transition-all duration-1000 ${newArrival ? 'scale-110 shadow-lg' : ''}`}>
        {collectedFlowers.length === 0 ? (
          <div className="text-gray-400 text-[8px] uppercase tracking-tighter opacity-40 text-center">Growth Space</div>
        ) : (
          <div className="relative w-full h-full">
            {collectedFlowers.map((type, index) => {
              const flower = FLOWERS[type];
              const angle = (index * 40) % 360;
              const x = Math.cos((angle * Math.PI) / 180) * 20;
              const y = Math.sin((angle * Math.PI) / 180) * 20;
              return (
                <div key={index} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 animate-float"
                     style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}>
                  <span className="text-2xl">{flower.icon}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const CalmAnimation: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/60 backdrop-blur-xl animate-in fade-in duration-1000">
      <div className="text-center">
        <div className="w-32 h-32 bg-pink-100/50 rounded-full animate-ping mx-auto mb-8" />
        <h2 className="text-4xl font-serif text-pink-400 italic">Exhale. You are okay.</h2>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [progress, setProgress] = useState<UserProgress>(() => {
    const saved = localStorage.getItem('one-petal-progress');
    try {
      return saved ? { ...INITIAL_PROGRESS, ...JSON.parse(saved) } : INITIAL_PROGRESS;
    } catch {
      return INITIAL_PROGRESS;
    }
  });
  const [isNight, setIsNight] = useState(() => localStorage.getItem('one-petal-night') === 'true');
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('one-petal-muted') === 'true');
  const [currentNote, setCurrentNote] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showLimit, setShowLimit] = useState(false);
  const [showFavs, setShowFavs] = useState(false);
  const [showCalm, setShowCalm] = useState(false);
  const [newArrival, setNewArrival] = useState(false);
  const [welcomeText, setWelcomeText] = useState(false);

  useEffect(() => {
    localStorage.setItem('one-petal-progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem('one-petal-night', String(isNight));
    localStorage.setItem('one-petal-muted', String(isMuted));
    soundService.setMuted(isMuted);
  }, [isNight, isMuted]);

  useEffect(() => {
    const today = new Date().toDateString();
    if (progress.lastVisitDate !== today) {
      const idx = progress.collectedFlowers.length;
      if (idx < FLOWER_LIST.length) {
        const nextFlower = FLOWER_LIST[idx];
        setProgress(p => ({
          ...p, lastVisitDate: today, 
          collectedFlowers: [...p.collectedFlowers, nextFlower],
          streak: p.streak + 1
        }));
        setNewArrival(true);
        setWelcomeText(true);
        soundService.playBloom();
        setTimeout(() => setNewArrival(false), 3000);
      } else {
        setProgress(p => ({ ...p, lastVisitDate: today, streak: p.streak + 1 }));
        setWelcomeText(true);
      }
    }
  }, []);

  const handleFlowerClick = async (flower: FlowerData) => {
    const today = new Date().toDateString();
    if (progress.lastNoteDate === today) {
      setShowLimit(true);
      return;
    }
    soundService.playTap();
    setIsLoading(true);
    const note = await selectBestNote(flower.type, CALMING_NOTES);
    setCurrentNote(note);
    setIsLoading(false);
    setProgress(p => ({ ...p, lastNoteDate: today, shownNotes: [...p.shownNotes, note] }));
  };

  const toggleFavorite = (note: string) => {
    soundService.playSave();
    setProgress(p => {
      const isFav = p.favorites.includes(note);
      return {
        ...p,
        favorites: isFav ? p.favorites.filter(f => f !== note) : [note, ...p.favorites]
      };
    });
  };

  return (
    <div className={`min-h-screen transition-all duration-1000 p-6 md:p-12 relative ${isNight ? 'bg-slate-950 text-slate-300' : 'bg-pastel-mix text-[#4a4a4a]'}`}>
      <header className="flex justify-between items-center mb-12 relative z-10 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="text-3xl animate-float">🌸</span>
          <div>
            <h1 className="text-3xl font-palace text-pink-500 leading-none">One Petal</h1>
            <p className="text-[8px] uppercase tracking-widest opacity-40">Since {progress.streak} days</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowFavs(true)} className="p-2 bg-white/40 rounded-full shadow-sm hover:bg-white/80 transition-all"><Heart size={18} className={progress.favorites.length > 0 ? 'fill-pink-400 text-pink-400' : ''}/></button>
          <button onClick={() => setIsMuted(!isMuted)} className="p-2 bg-white/40 rounded-full shadow-sm hover:bg-white/80 transition-all">{isMuted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
          <button onClick={() => setIsNight(!isNight)} className="p-2 bg-white/40 rounded-full shadow-sm hover:bg-white/80 transition-all">{isNight ? <Sun size={18}/> : <Moon size={18}/>}</button>
          <Bouquet collectedFlowers={progress.collectedFlowers} newArrival={newArrival} />
        </div>
      </header>

      {welcomeText && (
        <div className="max-w-xl mx-auto bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-pink-100 shadow-xl mb-12 animate-in slide-in-from-top duration-700 flex justify-between items-center backdrop-blur-md">
          <p className="font-serif italic text-lg text-pink-600">“You don’t have to do anything today. Being here is enough.”</p>
          <button onClick={() => setWelcomeText(false)} className="opacity-40 hover:opacity-100"><X size={18}/></button>
        </div>
      )}

      <main className="max-w-xl mx-auto text-center relative z-10">
        <h2 className="text-3xl font-serif mb-2">How is your heart today?</h2>
        <p className="text-xs opacity-50 mb-10 tracking-widest uppercase">Select one flower to receive a hidden note</p>
        
        <div className="grid grid-cols-3 gap-4 mb-12">
          {Object.values(FLOWERS).map(f => (
            <button key={f.id} onClick={() => handleFlowerClick(f)} className={`aspect-square rounded-[2rem] border border-white/50 flex items-center justify-center text-4xl hover:scale-105 active:scale-95 transition-all shadow-sm ${isNight ? 'bg-slate-900/50' : 'bg-white/60'}`}>
              {f.icon}
            </button>
          ))}
        </div>

        <button onClick={() => { soundService.playCalm(); setShowCalm(true); }} className="px-10 py-4 bg-white/40 border border-white shadow-sm rounded-full font-serif italic text-pink-500 hover:bg-white/80 transition-all flex items-center gap-2 mx-auto backdrop-blur-sm">
          <CheckCircle2 size={18} className="text-green-400" /> I'm okay now
        </button>
      </main>

      {currentNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-in fade-in">
          <div className={`p-10 rounded-[40px] max-w-sm w-full text-center relative shadow-2xl ${isNight ? 'bg-slate-900' : 'bg-white'}`}>
            <button onClick={() => setCurrentNote(null)} className="absolute top-6 right-6 opacity-40 hover:opacity-100"><X size={20}/></button>
            <div className="text-4xl mb-6">✨</div>
            <p className="text-2xl font-serif italic mb-10 leading-relaxed">“{currentNote}”</p>
            <button onClick={() => toggleFavorite(currentNote)} className="w-full py-4 bg-pink-400 text-white rounded-2xl font-bold flex items-center justify-center gap-2 mb-4 hover:bg-pink-500 shadow-lg shadow-pink-200">
              <Heart size={18} className={progress.favorites.includes(currentNote) ? 'fill-white' : ''}/> {progress.favorites.includes(currentNote) ? 'Saved' : 'Keep this'}
            </button>
            <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold">Come back tomorrow for another note.</p>
          </div>
        </div>
      )}

      {showLimit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-in fade-in">
          <div className={`p-10 rounded-[40px] max-w-sm w-full text-center shadow-2xl ${isNight ? 'bg-slate-900' : 'bg-white'}`}>
            <AlertCircle size={40} className="mx-auto text-amber-400 mb-6" />
            <h3 className="text-xl font-serif mb-2">Rest your heart.</h3>
            <p className="text-sm opacity-60 mb-8">One box is enough for today. Come back tomorrow for a new note.</p>
            <button onClick={() => setShowLimit(false)} className="px-8 py-3 bg-gray-100 dark:bg-slate-800 rounded-xl text-xs uppercase font-bold tracking-widest">I understand</button>
          </div>
        </div>
      )}

      {showFavs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-in slide-in-from-right">
          <div className={`p-8 rounded-[40px] max-w-lg w-full h-[70vh] flex flex-col shadow-2xl ${isNight ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-serif">Saved Whispers</h3>
              <button onClick={() => setShowFavs(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><X/></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar px-2">
              {progress.favorites.length === 0 ? (
                <p className="text-center opacity-40 italic mt-10">No whispers saved yet...</p>
              ) : (
                progress.favorites.map((n, i) => (
                  <div key={i} className="p-6 bg-gray-50 dark:bg-slate-800/50 border border-pink-50 dark:border-slate-700 rounded-2xl relative group">
                    <p className="italic font-serif">“{n}”</p>
                    <button onClick={() => toggleFavorite(n)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 transition-opacity"><Trash2 size={14}/></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isLoading && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-sm animate-pulse text-xs uppercase tracking-widest font-bold">Softening...</div>}
      {showCalm && <CalmAnimation onClose={() => setShowCalm(false)} />}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
