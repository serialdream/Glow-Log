import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dumbbell, Bike, Timer, Play, Pause, RotateCcw, Plus, TrendingUp,
  Trash2, Star, Sparkles, X, ArrowLeft, Check,
} from 'lucide-react';

const API_URL = 'https://glow-log-api.mexil-ronyca.workers.dev';

const GOALS = ['Push', 'Pull', 'Legs', 'Full Body', 'Cardio', 'Custom'];
const CARDIO_TYPES = ['Bike Ride', 'Run', 'Swim', 'Walk', 'Other'];
const REST_DEFAULT = 90;
const OVERLOAD_BUMP = 5;

const todayStr = () => new Date().toISOString().split('T')[0];

const fmtDate = (d) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

const fmtTime = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function topSet(exercise) {
  if (!exercise.sets || exercise.sets.length === 0) return null;

  return exercise.sets.reduce(
    (best, s) =>
      !best ||
      s.weight > best.weight ||
      (s.weight === best.weight && s.reps > best.reps)
        ? s
        : best,
    null
  );
}

function exerciseHistory(sessions, name) {
  const norm = name.trim().toLowerCase();
  const out = [];

  [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((s) => {
      const match = s.exercises.find(
        (e) => e.name.trim().toLowerCase() === norm
      );

      if (match) {
        out.push({
          date: s.date,
          ...match,
          top: topSet(match),
        });
      }
    });

  return out;
}

function suggestNextWeight(history) {
  if (history.length < 2) return null;

  const [a, b] = history;

  if (!a.top || !b.top) return null;

  if (
    a.top.weight === b.top.weight &&
    a.top.reps >= b.top.reps
  ) {
    return a.top.weight + OVERLOAD_BUMP;
  }

  return null;
}

function useAudioBeep() {
  const ctxRef = useRef(null);

  const unlock = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;

      if (AC) {
        ctxRef.current = new AC();
      }
    }

    if (ctxRef.current?.state === 'suspended') {
      ctxRef.current.resume();
    }
  };

  const beep = () => {
    const ctx = ctxRef.current;

    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 880;

    gain.gain.setValueAtTime(
      0.0001,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.3,
      ctx.currentTime + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + 0.4
    );

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  };

  return { unlock, beep };
}

export default function FitLog() {
  const [tab, setTab] = useState('gym');

  const [sessions, setSessions] = useState([]);
  const [cardioEntries, setCardioEntries] = useState([]);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [sessionDate, setSessionDate] = useState(todayStr());
  const [goal, setGoal] = useState('Push');
  const [customGoal, setCustomGoal] = useState('');

  const [exercises, setExercises] = useState([]);
  const [exName, setExName] = useState('');
  const [pendingSets, setPendingSets] = useState([]);

  const [setWeight, setSetWeight] = useState('');
  const [setReps, setSetReps] = useState('');

  const [timerOpen, setTimerOpen] = useState(false);
  const [restDuration, setRestDuration] = useState(REST_DEFAULT);
  const [secondsLeft, setSecondsLeft] = useState(REST_DEFAULT);
  const [running, setRunning] = useState(false);

  const intervalRef = useRef(null);
  const { unlock, beep } = useAudioBeep();

  const [cardioDate, setCardioDate] = useState(todayStr());
  const [cardioType, setCardioType] = useState('Bike Ride');
  const [cardioDuration, setCardioDuration] = useState('');
  const [cardioDistance, setCardioDistance] = useState('');
  const [cardioNotes, setCardioNotes] = useState('');

  const showToast = (msg) => {
    setToast(msg);

    setTimeout(() => {
      setToast('');
    }, 2200);
  };

  const saveCloudState = async (
    updatedSessions,
    updatedCardioEntries
  ) => {
    const response = await fetch(`${API_URL}/api/state`);

    if (!response.ok) {
      throw new Error(
        `Cloud load failed: ${response.status}`
      );
    }

    const cloud = await response.json();

    const saveResponse = await fetch(`${API_URL}/api/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...cloud,
        sessions: updatedSessions,
        cardioEntries: updatedCardioEntries,
      }),
    });

    if (!saveResponse.ok) {
      throw new Error(
        `Cloud save failed: ${saveResponse.status}`
      );
    }
  };

  useEffect(() => {
    async function loadData() {
      let localSessions = [];
      let localCardio = [];

      try {
        const s = localStorage.getItem('fitlog-sessions');

        if (s) {
          localSessions = JSON.parse(s);
          setSessions(localSessions);
        }
      } catch (e) {}

      try {
        const c = localStorage.getItem('fitlog-cardio');

        if (c) {
          localCardio = JSON.parse(c);
          setCardioEntries(localCardio);
        }
      } catch (e) {}

      try {
        const response = await fetch(`${API_URL}/api/state`);

        if (!response.ok) {
          throw new Error(
            `Cloud load failed: ${response.status}`
          );
        }

        const cloud = await response.json();

        if (Array.isArray(cloud.sessions)) {
          setSessions(cloud.sessions);

          localStorage.setItem(
            'fitlog-sessions',
            JSON.stringify(cloud.sessions)
          );
        }

        if (Array.isArray(cloud.cardioEntries)) {
          setCardioEntries(cloud.cardioEntries);

          localStorage.setItem(
            'fitlog-cardio',
            JSON.stringify(cloud.cardioEntries)
          );
        }
      } catch (err) {
        console.log(
          'Fit Log cloud unavailable, using local backup',
          err
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (running && secondsLeft > 0) {
      intervalRef.current = setTimeout(
        () => setSecondsLeft((s) => s - 1),
        1000
      );
    } else if (running && secondsLeft === 0) {
      setRunning(false);
      beep();
    }

    return () => clearTimeout(intervalRef.current);
  }, [running, secondsLeft]);

  const startTimer = () => {
    unlock();
    setSecondsLeft(restDuration);
    setRunning(true);
    setTimerOpen(true);
  };

  const pauseTimer = () => {
    setRunning(false);
  };

  const resumeTimer = () => {
    unlock();
    setRunning(true);
  };

  const resetTimer = () => {
    setSecondsLeft(restDuration);
    setRunning(false);
  };

  const adjustDuration = (delta) => {
    const next = Math.max(
      15,
      restDuration + delta
    );

    setRestDuration(next);

    if (!running) {
      setSecondsLeft(next);
    }
  };

  const distinctExerciseNames = useMemo(() => {
    const set = new Set();

    sessions.forEach((s) =>
      s.exercises.forEach((e) => set.add(e.name))
    );

    return Array.from(set).sort();
  }, [sessions]);

  const currentExHistory = useMemo(
    () =>
      exName.trim()
        ? exerciseHistory(sessions, exName)
        : [],
    [exName, sessions]
  );

  const suggestion = useMemo(
    () => suggestNextWeight(currentExHistory),
    [currentExHistory]
  );

  const readTypedSet = () => {
    if (
      setWeight.trim() === '' ||
      setReps.trim() === ''
    ) {
      return null;
    }

    const w = parseFloat(setWeight);
    const r = parseInt(setReps, 10);

    if (
      isNaN(w) ||
      isNaN(r) ||
      w < 0 ||
      r <= 0
    ) {
      return null;
    }

    return {
      weight: w,
      reps: r,
    };
  };

  const addSet = () => {
    const typed = readTypedSet();

    if (!typed) {
      showToast('Enter weight and reps');
      return;
    }

    setPendingSets((s) => [...s, typed]);
    setSetWeight('');
    setSetReps('');
  };

  const removeSet = (idx) => {
    setPendingSets((s) =>
      s.filter((_, i) => i !== idx)
    );
  };

  const addExerciseToSession = () => {
    const typed = readTypedSet();

    const sets = typed
      ? [...pendingSets, typed]
      : pendingSets;

    if (
      !exName.trim() ||
      sets.length === 0
    ) {
      showToast(
        !exName.trim()
          ? 'Give the exercise a name'
          : 'Add at least one set (weight + reps)'
      );

      return;
    }

    setExercises((ex) => [
      ...ex,
      {
        name: exName.trim(),
        sets,
      },
    ]);

    setExName('');
    setPendingSets([]);
    setSetWeight('');
    setSetReps('');
  };

  const removeExercise = (idx) => {
    setExercises((ex) =>
      ex.filter((_, i) => i !== idx)
    );
  };

  const saveSession = async () => {
    let finalExercises = exercises;

    const typed = readTypedSet();

    const looseSets = typed
      ? [...pendingSets, typed]
      : pendingSets;

    if (
      exName.trim() &&
      looseSets.length > 0
    ) {
      finalExercises = [
        ...exercises,
        {
          name: exName.trim(),
          sets: looseSets,
        },
      ];
    }

    if (finalExercises.length === 0) {
      showToast('Add at least one exercise first');
      return;
    }

    const finalGoal =
      goal === 'Custom'
        ? customGoal.trim() || 'Custom'
        : goal;

    const newSession = {
      id: `${sessionDate}-${Date.now()}`,
      date: sessionDate,
      goal: finalGoal,
      exercises: finalExercises,
    };

    const updated = [
      ...sessions,
      newSession,
    ];

    setSessions(updated);

    localStorage.setItem(
      'fitlog-sessions',
      JSON.stringify(updated)
    );

    setExercises([]);
    setExName('');
    setPendingSets([]);
    setSetWeight('');
    setSetReps('');
    setCustomGoal('');

    try {
      await saveCloudState(
        updated,
        cardioEntries
      );

      showToast('Workout saved ✓');
    } catch (err) {
      console.error(err);

      showToast('Workout saved locally');
    }
  };

  const deleteSession = async (id) => {
    const updated = sessions.filter(
      (s) => s.id !== id
    );

    setSessions(updated);

    localStorage.setItem(
      'fitlog-sessions',
      JSON.stringify(updated)
    );

    try {
      await saveCloudState(
        updated,
        cardioEntries
      );

      showToast('Deleted ✓');
    } catch (err) {
      console.error(err);

      showToast('Deleted locally');
    }
  };

  const saveCardio = async () => {
    if (!cardioDuration) {
      showToast('Add a duration');
      return;
    }

    const entry = {
      id: `${cardioDate}-${Date.now()}`,
      date: cardioDate,
      activity: cardioType,
      duration: cardioDuration,
      distance: cardioDistance,
      notes: cardioNotes,
    };

    const updated = [
      ...cardioEntries,
      entry,
    ];

    setCardioEntries(updated);

    localStorage.setItem(
      'fitlog-cardio',
      JSON.stringify(updated)
    );

    setCardioDuration('');
    setCardioDistance('');
    setCardioNotes('');

    try {
      await saveCloudState(
        sessions,
        updated
      );

      showToast('Ride/activity saved ✓');
    } catch (err) {
      console.error(err);

      showToast('Ride saved locally');
    }
  };

  const deleteCardio = async (id) => {
    const updated = cardioEntries.filter(
      (c) => c.id !== id
    );

    setCardioEntries(updated);

    localStorage.setItem(
      'fitlog-cardio',
      JSON.stringify(updated)
    );

    try {
      await saveCloudState(
        sessions,
        updated
      );

      showToast('Deleted ✓');
    } catch (err) {
      console.error(err);

      showToast('Deleted locally');
    }
  };

  const allHistoryItems = useMemo(() => {
    const gymItems = sessions.map((s) => ({
      type: 'gym',
      ...s,
    }));

    const cardioItems = cardioEntries.map((c) => ({
      type: 'cardio',
      ...c,
    }));

    return [
      ...gymItems,
      ...cardioItems,
    ].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [sessions, cardioEntries]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(160deg, #C9B6F0 0%, #B79AEE 35%, #9B7FE8 70%, #8A6EDD 100%)',
          fontFamily: 'system-ui',
          color: '#fff',
        }}
      >
        <div>loading gains…</div>
      </div>
    );
  }

  const cardStyle = {
    background: 'rgba(255,255,255,0.9)',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    boxShadow:
      '0 8px 24px rgba(109,69,196,0.18)',
    backdropFilter: 'blur(10px)',
    border:
      '1px solid rgba(255,255,255,0.6)',
  };

  const inputStyle = {
    padding: '10px 14px',
    borderRadius: 12,
    border:
      '1.5px solid #E4D9FA',
    fontSize: 14,
    color: '#5B4285',
    background: '#FBF9FF',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(160deg, #E8DFFC 0%, #D7C6F7 30%, #C4AEF2 60%, #B79AEE 100%)',
        fontFamily:
          "'Baloo 2', 'Nunito', system-ui, -apple-system, sans-serif",
        paddingBottom: 40,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        input, textarea, select { font-family: inherit; }
        input:focus, textarea:focus, select:focus { outline: none; }
        button { font-family: inherit; cursor: pointer; }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-thumb { background: #B79AEE; border-radius: 10px; }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {[
          {
            top: '6%',
            left: '12%',
            size: 10,
            delay: '0s',
          },
          {
            top: '10%',
            left: '82%',
            size: 7,
            delay: '0.6s',
          },
          {
            top: '22%',
            left: '45%',
            size: 5,
            delay: '1.2s',
          },
          {
            top: '30%',
            left: '90%',
            size: 8,
            delay: '0.4s',
          },
        ].map((s, i) => (
          <Star
            key={i}
            size={s.size}
            fill="#fff"
            color="#fff"
            style={{
              position: 'absolute',
              top: s.top,
              left: s.left,
              animation:
                'twinkle 2.4s ease-in-out infinite',
              animationDelay: s.delay,
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      <div
        style={{
          padding: '16px 20px 0',
        }}
      >
        <a
          href="./"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
            opacity: 0.9,
          }}
        >
          <ArrowLeft size={14} />
          Glow Log
        </a>
      </div>

      <div
        style={{
          padding:
            '14px 20px 18px',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            margin: '0 auto 10px',
            background:
              'linear-gradient(135deg, #FFE9A8, #FFD166)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow:
              '0 6px 20px rgba(255, 209, 102, 0.5), inset 0 -3px 6px rgba(0,0,0,0.06)',
          }}
        >
          <Dumbbell
            size={26}
            color="#8A6EDD"
          />
        </div>

        <h1
          style={{
            fontFamily:
              "'Baloo 2', sans-serif",
            fontWeight: 800,
            fontSize: 24,
            color: '#fff',
            margin: 0,
            textShadow:
              '0 2px 10px rgba(109, 69, 196, 0.4)',
          }}
        >
          Fit Log
        </h1>

        <p
          style={{
            color: '#F0EAFC',
            fontSize: 13,
            margin: '4px 0 0',
            fontWeight: 600,
          }}
        >
          gym sessions & rides, tracked ✨
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 20,
        }}
      >
        {[
          ['gym', 'Gym Mode'],
          ['cardio', 'Cardio'],
          ['history', 'History'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding:
                '9px 18px',
              borderRadius: 20,
              border: 'none',
              background:
                tab === key
                  ? '#fff'
                  : 'rgba(255,255,255,0.25)',
              color:
                tab === key
                  ? '#8A6EDD'
                  : '#fff',
              fontWeight: 700,
              fontSize: 13,
              transition:
                'all 0.2s',
              boxShadow:
                tab === key
                  ? '0 4px 14px rgba(109,69,196,0.25)'
                  : 'none',
              backdropFilter:
                'blur(6px)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '0 16px',
          position: 'relative',
        }}
      >
        {tab === 'gym' && (
          <>
            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems:
                    'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <Dumbbell
                  size={16}
                  color="#8A6EDD"
                />

                <span
                  style={{
                    fontWeight: 800,
                    color: '#6D45C4',
                    fontSize: 14,
                  }}
                >
                  Today's session
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <input
                  type="date"
                  value={sessionDate}
                  max={todayStr()}
                  onChange={(e) =>
                    setSessionDate(
                      e.target.value
                    )
                  }
                  style={{
                    ...inputStyle,
                    flex: 1,
                    minWidth: 0,
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {GOALS.map((g) => (
                  <button
                    key={g}
                    onClick={() =>
                      setGoal(g)
                    }
                    style={{
                      padding:
                        '7px 14px',
                      borderRadius: 14,
                      border: 'none',
                      background:
                        goal === g
                          ? '#8A6EDD'
                          : '#EFE7FC',
                      color:
                        goal === g
                          ? '#fff'
                          : '#6D45C4',
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {goal === 'Custom' && (
                <input
                  type="text"
                  placeholder="Name this workout goal"
                  value={customGoal}
                  onChange={(e) =>
                    setCustomGoal(
                      e.target.value
                    )
                  }
                  style={{
                    ...inputStyle,
                    width: '100%',
                    marginTop: 10,
                  }}
                />
              )}
            </div>

            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  marginBottom:
                    timerOpen
                      ? 14
                      : 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems:
                      'center',
                    gap: 8,
                  }}
                >
                  <Timer
                    size={16}
                    color="#8A6EDD"
                  />

                  <span
                    style={{
                      fontWeight: 800,
                      color:
                        '#6D45C4',
                      fontSize: 14,
                    }}
                  >
                    Rest timer
                  </span>
                </div>

                {!timerOpen && (
                  <button
                    onClick={
                      startTimer
                    }
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      gap: 6,
                      padding:
                        '7px 14px',
                      borderRadius: 14,
                      border: 'none',
                      background:
                        '#8A6EDD',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    <Play size={12} />
                    Start {restDuration}s
                  </button>
                )}
              </div>

              {timerOpen && (
                <div
                  style={{
                    textAlign:
                      'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 800,
                      color:
                        secondsLeft ===
                        0
                          ? '#8A6EDD'
                          : '#6D45C4',
                      fontFamily:
                        "'Baloo 2', sans-serif",
                      marginBottom: 12,
                    }}
                  >
                    {fmtTime(
                      secondsLeft
                    )}
                  </div>

                  <div
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'center',
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {running ? (
                      <button
                        onClick={
                          pauseTimer
                        }
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: 6,
                          padding:
                            '8px 16px',
                          borderRadius: 14,
                          border:
                            'none',
                          background:
                            '#EFE7FC',
                          color:
                            '#6D45C4',
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        <Pause size={13} />
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={
                          resumeTimer
                        }
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: 6,
                          padding:
                            '8px 16px',
                          borderRadius: 14,
                          border:
                            'none',
                          background:
                            '#8A6EDD',
                          color:
                            '#fff',
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        <Play size={13} />
                        {secondsLeft ===
                        0
                          ? 'Restart'
                          : 'Resume'}
                      </button>
                    )}

                    <button
                      onClick={
                        resetTimer
                      }
                      style={{
                        display:
                          'flex',
                        alignItems:
                          'center',
                        gap: 6,
                        padding:
                          '8px 16px',
                        borderRadius: 14,
                        border: 'none',
                        background:
                          '#EFE7FC',
                        color:
                          '#6D45C4',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      <RotateCcw
                        size={13}
                      />
                      Reset
                    </button>

                    <button
                      onClick={() => {
                        setTimerOpen(
                          false
                        );
                        setRunning(
                          false
                        );
                      }}
                      style={{
                        display:
                          'flex',
                        alignItems:
                          'center',
                        gap: 6,
                        padding:
                          '8px 12px',
                        borderRadius: 14,
                        border: 'none',
                        background:
                          'transparent',
                        color:
                          '#C6B4EC',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'center',
                      gap: 8,
                    }}
                  >
                    <button
                      onClick={() =>
                        adjustDuration(
                          -15
                        )
                      }
                      style={{
                        padding:
                          '4px 10px',
                        borderRadius: 10,
                        border:
                          '1px solid #E4D9FA',
                        background:
                          '#fff',
                        color:
                          '#6D45C4',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      -15s
                    </button>

                    <span
                      style={{
                        fontSize: 11,
                        color:
                          '#9B85C9',
                        alignSelf:
                          'center',
                      }}
                    >
                      default{' '}
                      {restDuration}s
                    </span>

                    <button
                      onClick={() =>
                        adjustDuration(
                          15
                        )
                      }
                      style={{
                        padding:
                          '4px 10px',
                        borderRadius: 10,
                        border:
                          '1px solid #E4D9FA',
                        background:
                          '#fff',
                        color:
                          '#6D45C4',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      +15s
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems:
                    'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <Sparkles
                  size={14}
                  color="#8A6EDD"
                />

                <span
                  style={{
                    fontWeight: 800,
                    color: '#6D45C4',
                    fontSize: 14,
                  }}
                >
                  Add exercise
                </span>
              </div>

              <input
                type="text"
                list="exercise-suggestions"
                placeholder="e.g. Deadlift, Rows, Good mornings"
                value={exName}
                onChange={(e) =>
                  setExName(
                    e.target.value
                  )
                }
                style={{
                  ...inputStyle,
                  width: '100%',
                  marginBottom: 8,
                }}
              />

              <datalist id="exercise-suggestions">
                {distinctExerciseNames.map(
                  (n) => (
                    <option
                      key={n}
                      value={n}
                    />
                  )
                )}
              </datalist>

              {exName.trim() &&
                currentExHistory.length >
                  0 && (
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        '#6D45C4',
                      background:
                        '#F5EFFD',
                      borderRadius: 10,
                      padding:
                        '8px 10px',
                      marginBottom: 10,
                      display:
                        'flex',
                      alignItems:
                        'center',
                      gap: 6,
                      flexWrap:
                        'wrap',
                    }}
                  >
                    <TrendingUp
                      size={12}
                    />

                    <span>
                      Last:{' '}
                      {
                        currentExHistory[0]
                          .top.weight
                      }{' '}
                      lbs ×{' '}
                      {
                        currentExHistory[0]
                          .top.reps
                      }{' '}
                      (
                      {fmtDate(
                        currentExHistory[0]
                          .date
                      )}
                      )
                    </span>

                    {suggestion && (
                      <span
                        style={{
                          fontWeight: 800,
                        }}
                      >
                        · Try{' '}
                        {suggestion} lbs
                        next 💪
                      </span>
                    )}
                  </div>
                )}

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  type="number"
                  placeholder="Weight (lbs)"
                  value={setWeight}
                  onChange={(e) =>
                    setSetWeight(
                      e.target.value
                    )
                  }
                  style={{
                    ...inputStyle,
                    flex: 1,
                    minWidth: 0,
                  }}
                />

                <input
                  type="number"
                  placeholder="Reps"
                  value={setReps}
                  onChange={(e) =>
                    setSetReps(
                      e.target.value
                    )
                  }
                  style={{
                    ...inputStyle,
                    flex: 1,
                    minWidth: 0,
                  }}
                />

                <button
                  onClick={addSet}
                  style={{
                    padding:
                      '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background:
                      '#EFE7FC',
                    color: '#6D45C4',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>

              <div
                style={{
                  fontSize: 10.5,
                  color: '#B29FDD',
                  marginBottom: 10,
                  marginTop: -2,
                }}
              >
                tap + to add each set,
                or just leave your last set
                filled in — "Add to
                session" will grab it
                automatically
              </div>

              {pendingSets.length >
                0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  {pendingSets.map(
                    (s, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 11,
                          background:
                            '#EFE7FC',
                          color:
                            '#6D45C4',
                          padding:
                            '5px 10px',
                          borderRadius: 10,
                          fontWeight: 700,
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: 4,
                        }}
                      >
                        Set {i + 1}:{' '}
                        {s.weight}×
                        {s.reps}

                        <button
                          onClick={() =>
                            removeSet(
                              i
                            )
                          }
                          style={{
                            background:
                              'none',
                            border:
                              'none',
                            color:
                              '#B79AEE',
                            padding: 0,
                            marginLeft: 2,
                            display:
                              'flex',
                          }}
                        >
                          <X
                            size={11}
                          />
                        </button>
                      </span>
                    )
                  )}
                </div>
              )}

              <button
                onClick={
                  addExerciseToSession
                }
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 14,
                  border: 'none',
                  background:
                    'linear-gradient(135deg, #B79AEE, #8A6EDD)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                Add to session
              </button>
            </div>

            {exercises.length > 0 && (
              <div style={cardStyle}>
                <div
                  style={{
                    fontWeight: 800,
                    color:
                      '#6D45C4',
                    fontSize: 14,
                    marginBottom: 10,
                  }}
                >
                  This session (
                  {exercises.length})
                </div>

                {exercises.map(
                  (ex, i) => (
                    <div
                      key={i}
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'flex-start',
                        padding:
                          '8px 0',
                        borderBottom:
                          i <
                          exercises.length -
                            1
                            ? '1px solid #F1EBFC'
                            : 'none',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color:
                              '#5B4285',
                          }}
                        >
                          {ex.name}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color:
                              '#9B85C9',
                          }}
                        >
                          {ex.sets
                            .map(
                              (s) =>
                                `${s.weight}×${s.reps}`
                            )
                            .join(', ')}
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          removeExercise(
                            i
                          )
                        }
                        style={{
                          background:
                            'none',
                          border:
                            'none',
                          color:
                            '#C6B4EC',
                        }}
                      >
                        <Trash2
                          size={14}
                        />
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            <button
              onClick={saveSession}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 18,
                border: 'none',
                background:
                  'linear-gradient(135deg, #FFD166, #FFB74D)',
                color: '#6D45C4',
                fontWeight: 800,
                fontSize: 15,
                boxShadow:
                  '0 6px 20px rgba(255,183,77,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'center',
                gap: 8,
              }}
            >
              <Check size={17} />
              Save workout
            </button>
          </>
        )}

        {tab === 'cardio' && (
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Bike
                size={16}
                color="#8A6EDD"
              />

              <span
                style={{
                  fontWeight: 800,
                  color: '#6D45C4',
                  fontSize: 14,
                }}
              >
                Log a ride / cardio
              </span>
            </div>

            <input
              type="date"
              value={cardioDate}
              max={todayStr()}
              onChange={(e) =>
                setCardioDate(
                  e.target.value
                )
              }
              style={{
                ...inputStyle,
                width: '100%',
                marginBottom: 10,
              }}
            />

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 10,
              }}
            >
              {CARDIO_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setCardioType(t)
                  }
                  style={{
                    padding:
                      '7px 14px',
                    borderRadius: 14,
                    border: 'none',
                    background:
                      cardioType === t
                        ? '#8A6EDD'
                        : '#EFE7FC',
                    color:
                      cardioType === t
                        ? '#fff'
                        : '#6D45C4',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <input
                type="number"
                placeholder="Duration (min)"
                value={
                  cardioDuration
                }
                onChange={(e) =>
                  setCardioDuration(
                    e.target.value
                  )
                }
                style={{
                  ...inputStyle,
                  flex: 1,
                  minWidth: 0,
                }}
              />

              <input
                type="number"
                placeholder="Distance (mi, optional)"
                value={
                  cardioDistance
                }
                onChange={(e) =>
                  setCardioDistance(
                    e.target.value
                  )
                }
                style={{
                  ...inputStyle,
                  flex: 1,
                  minWidth: 0,
                }}
              />
            </div>

            <textarea
              placeholder="Notes (route, how it felt...)"
              value={cardioNotes}
              onChange={(e) =>
                setCardioNotes(
                  e.target.value
                )
              }
              rows={2}
              style={{
                ...inputStyle,
                width: '100%',
                marginBottom: 12,
                resize: 'none',
              }}
            />

            <button
              onClick={saveCardio}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 18,
                border: 'none',
                background:
                  'linear-gradient(135deg, #B79AEE, #8A6EDD)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 15,
                boxShadow:
                  '0 6px 20px rgba(109,69,196,0.4)',
              }}
            >
              ✨ Save
            </button>
          </div>
        )}

        {tab === 'history' && (
          <>
            {allHistoryItems.length ===
            0 ? (
              <div
                style={{
                  textAlign:
                    'center',
                  color: '#fff',
                  padding:
                    '48px 20px',
                  fontSize: 14,
                  background:
                    'rgba(255,255,255,0.15)',
                  borderRadius: 24,
                  backdropFilter:
                    'blur(6px)',
                }}
              >
                <Star
                  size={22}
                  fill="#fff"
                  style={{
                    marginBottom: 8,
                    opacity: 0.9,
                  }}
                />

                <div>
                  No workouts or rides
                  logged yet ✨
                </div>
              </div>
            ) : (
              allHistoryItems.map(
                (item) => (
                  <div
                    key={item.id}
                    style={{
                      background:
                        'rgba(255,255,255,0.9)',
                      borderRadius: 20,
                      padding: 16,
                      marginBottom: 12,
                      boxShadow:
                        '0 6px 18px rgba(109,69,196,0.14)',
                      backdropFilter:
                        'blur(10px)',
                      border:
                        '1px solid rgba(255,255,255,0.6)',
                    }}
                  >
                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'flex-start',
                      }}
                    >
                      <div
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: 6,
                        }}
                      >
                        {item.type ===
                        'gym' ? (
                          <Dumbbell
                            size={14}
                            color="#8A6EDD"
                          />
                        ) : (
                          <Bike
                            size={14}
                            color="#8A6EDD"
                          />
                        )}

                        <span
                          style={{
                            fontWeight: 800,
                            color:
                              '#6D45C4',
                            fontSize: 14,
                          }}
                        >
                          {fmtDate(
                            item.date
                          )}
                        </span>

                        <span
                          style={{
                            fontSize: 11,
                            background:
                              '#EFE7FC',
                            color:
                              '#6D45C4',
                            padding:
                              '3px 8px',
                            borderRadius: 8,
                            fontWeight: 700,
                          }}
                        >
                          {item.type ===
                          'gym'
                            ? item.goal
                            : item.activity}
                        </span>
                      </div>

                      <button
                        onClick={() =>
                          item.type ===
                          'gym'
                            ? deleteSession(
                                item.id
                              )
                            : deleteCardio(
                                item.id
                              )
                        }
                        style={{
                          background:
                            'none',
                          border:
                            'none',
                          color:
                            '#C6B4EC',
                        }}
                      >
                        <Trash2
                          size={14}
                        />
                      </button>
                    </div>

                    {item.type ===
                    'gym' ? (
                      <div
                        style={{
                          marginTop: 8,
                        }}
                      >
                        {item.exercises.map(
                          (ex, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: 12,
                                color:
                                  '#5B4285',
                                marginBottom: 3,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 700,
                                }}
                              >
                                {ex.name}:
                              </span>{' '}
                              {ex.sets
                                .map(
                                  (s) =>
                                    `${s.weight}×${s.reps}`
                                )
                                .join(
                                  ', '
                                )}
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12,
                          color:
                            '#5B4285',
                          marginTop: 6,
                        }}
                      >
                        {item.duration} min
                        {item.distance
                          ? ` · ${item.distance} mi`
                          : ''}

                        {item.notes && (
                          <div
                            style={{
                              fontStyle:
                                'italic',
                              color:
                                '#8570A8',
                              marginTop: 4,
                            }}
                          >
                            "{item.notes}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )
            )}
          </>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform:
              'translateX(-50%)',
            background: '#6D45C4',
            color: '#fff',
            padding:
              '10px 20px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 700,
            boxShadow:
              '0 6px 20px rgba(109,69,196,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            zIndex: 10,
            maxWidth: '85%',
            textAlign: 'center',
          }}
        >
          <Sparkles
            size={13}
            style={{
              flexShrink: 0,
            }}
          />

          {toast}
        </div>
      )}
    </div>
  );
}
