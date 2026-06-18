import React, { useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';
import { ref, onValue, set } from 'firebase/database';
import { rtdb } from '../config/firebaseClient';
import { usePlan } from '../hooks/usePlan';

const playSiren = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const ctx = new AudioContext();
  
  // Create oscillator and gain node
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
  
  // Add a siren modulation effect (frequency sweeping up and down)
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 2.0; // 2 Hz frequency sweep
  lfoGain.gain.value = 150; // Sweeping +/- 150 Hz
  
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  // Set volume and loop
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  
  lfo.start();
  osc.start();
  
  return {
    stop: () => {
      try {
        osc.stop();
        lfo.stop();
        ctx.close();
      } catch (e) {}
    }
  };
};

export default function EmergencyOverlay() {
  const { schoolSettings, user, role } = useAppStore();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissed_emergency_alerts') || '[]');
    } catch {
      return [];
    }
  });

  const { isFree } = usePlan();

  useEffect(() => {
    if (!schoolSettings?.school_id || !user) return;

    // Fetch active alerts on mount (within last 24h)
    const fetchActiveAlerts = async () => {
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      const { data, error } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('school_id', schoolSettings.school_id)
        .eq('status', 'active')
        .gt('created_at', yesterday.toISOString())
        .order('created_at', { ascending: false });

      if (data) {
        const relevant = data.filter(a => isTargeted(a));
        setActiveAlerts(relevant);
      }
    };

    fetchActiveAlerts();

    // 1. Subscribe to Firebase RTDB changes (Premium only)
    let unsubscribeFirebase = null;
    if (!isFree && rtdb) {
      const alertUpdateRef = ref(rtdb, `schools/${schoolSettings.school_id}/emergency_alert_update`);
      unsubscribeFirebase = onValue(alertUpdateRef, (snapshot) => {
        fetchActiveAlerts();
      });
    }

    // 2. Subscribe to foreground Capacitor Push event (Free & Premium)
    const handlePushReceived = () => {
      fetchActiveAlerts();
    };
    window.addEventListener('sp-push-received', handlePushReceived);

    // 3. Subscribe to Supabase Realtime changes (Free & Premium / Web & Native)
    const channel = supabase
      .channel('emergency-alerts-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'emergency_alerts',
        filter: `school_id=eq.${schoolSettings.school_id}`
      }, (payload) => {
        console.info('[EmergencyOverlay] Realtime event received:', payload);
        fetchActiveAlerts();
      })
      .subscribe();

    return () => {
      if (unsubscribeFirebase) unsubscribeFirebase();
      window.removeEventListener('sp-push-received', handlePushReceived);
      supabase.removeChannel(channel);
    };
  }, [schoolSettings?.school_id, user, role, isFree]);

  const isTargeted = (alert) => {
    if (!role) return false;
    const r = role.toLowerCase();
    
    // Check specific user targeting
    if (alert.target_audience === 'specific_students') {
      return alert.target_users?.includes(user.id);
    }
    
    if (alert.target_audience === 'admin' && (r === 'admin' || r === 'platform_admin')) return true;
    if (alert.target_audience === 'all') return true;
    if (alert.target_audience === 'staff' && (r === 'admin' || r === 'teacher' || r === 'staff' || r === 'driver' || r === 'app_manager')) return true;
    if (alert.target_audience === 'students' && r === 'student') return true;
    
    return false;
  };

  const handleDismiss = (id) => {
    const newDismissed = [...dismissedAlerts, id];
    setDismissedAlerts(newDismissed);
    localStorage.setItem('dismissed_emergency_alerts', JSON.stringify(newDismissed));
  };

  const visibleAlerts = activeAlerts.filter(a => !dismissedAlerts.includes(a.id));

  // Handle siren audio ringtone loop
  useEffect(() => {
    let siren = null;
    if (visibleAlerts.length > 0) {
      siren = playSiren();
    }
    return () => {
      if (siren) siren.stop();
    };
  }, [visibleAlerts.length]);

  if (visibleAlerts.length === 0) return null;

  // Any alert that targets the current active user should trigger the fullscreen warning card
  const fullScreenAlert = visibleAlerts[0];
  
  if (fullScreenAlert) {
    const isLockdown = fullScreenAlert.alert_type === 'lockdown';
    const isWeather = fullScreenAlert.alert_type === 'weather';
    const bgColor = isLockdown ? 'bg-red-600' : isWeather ? 'bg-amber-600' : 'bg-indigo-600';
    const Icon = isLockdown ? AlertTriangle : isWeather ? AlertTriangle : Info;

    return (
      <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6 ${bgColor} text-white animate-in fade-in duration-300`}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex flex-col items-center text-center max-w-lg w-full bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/20 shadow-2xl">
          {/* Close button in the top-right corner of the overlay card */}
          <button 
            onClick={() => handleDismiss(fullScreenAlert.id)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer border-0 flex items-center justify-center"
            title="Dismiss Alert"
          >
            <X size={18} />
          </button>
          <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
            <Icon size={48} className="text-white" />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-widest mb-2">{fullScreenAlert.alert_type} ALERT</h1>
          <p className="text-xl font-bold mb-8 opacity-90 leading-relaxed">{fullScreenAlert.message}</p>
          <div className="w-full bg-white/10 rounded-xl p-4 mb-8">
            <p className="text-sm font-bold uppercase tracking-widest opacity-80 mb-1">Target Audience</p>
            <p className="font-semibold">{fullScreenAlert.target_audience.toUpperCase()}</p>
          </div>
          {role === 'admin' || role === 'app_manager' || role === 'platform_admin' ? (
            <button 
              onClick={async () => {
                await supabase.from('emergency_alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', fullScreenAlert.id);
                if (rtdb && schoolSettings?.school_id) {
                  set(ref(rtdb, `schools/${schoolSettings.school_id}/emergency_alert_update`), Date.now()).catch(console.error);
                }
                setActiveAlerts(prev => prev.filter(a => a.id !== fullScreenAlert.id));
              }}
              className="w-full py-4 bg-white text-red-600 rounded-xl font-black text-lg shadow-xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 cursor-pointer border-0"
            >
              <CheckCircle2 /> Dismiss & Resolve Alert
            </button>
          ) : (
            <button 
              onClick={() => handleDismiss(fullScreenAlert.id)}
              className="w-full py-4 bg-white/20 hover:bg-white/30 text-white rounded-xl font-black text-lg shadow-xl transition-colors flex items-center justify-center gap-2 cursor-pointer border-0"
            >
              Dismiss Alert <X size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Banner Alerts (Targeted: specific_students, admin)
  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] flex flex-col items-center pointer-events-none p-4 gap-2">
      {visibleAlerts.map(alert => (
        <div key={alert.id} className="pointer-events-auto bg-red-600/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border border-red-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full max-w-4xl animate-in slide-in-from-top">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
              <AlertTriangle size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-red-200">
                {alert.alert_type} ALERT
              </h3>
              <p className="text-sm font-bold text-white mt-0.5">{alert.message}</p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto flex-shrink-0">
            {role === 'admin' || role === 'platform_admin' ? (
              <button 
                onClick={async () => {
                  await supabase.from('emergency_alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', alert.id);
                  if (rtdb && schoolSettings?.school_id) {
                    set(ref(rtdb, `schools/${schoolSettings.school_id}/emergency_alert_update`), Date.now()).catch(console.error);
                  }
                  setActiveAlerts(prev => prev.filter(a => a.id !== alert.id));
                }}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 flex-1 sm:flex-none"
              >
                Resolve <CheckCircle2 size={14} />
              </button>
            ) : null}
            <button 
              onClick={() => handleDismiss(alert.id)}
              className="px-4 py-2 bg-black/20 hover:bg-black/30 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 flex-1 sm:flex-none"
            >
              Dismiss <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
