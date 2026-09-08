import { useState, useEffect, useMemo, useRef } from 'react';

const API_URL = 'https://glow-log-api.mexil-ronyca.workers.dev';
import { Syringe, Trash2, TrendingUp, Sparkles, Moon, Star, Upload, Scale, Info } from 'lucide-react';

const SYMPTOMS = [
  { key: 'nausea', label: 'Nausea', emoji: '🤢' },
  { key: 'fatigue', label: 'Fatigue', emoji: '😴' },
  { key: 'appetite', label: 'Appetite', emoji: '🍽️' },
  { key: 'energy', label: 'Energy', emoji: '⚡' },
  { key: 'bloating', label: 'Bloating', emoji: '🎈' },
  { key: 'mood', label: 'Mood', emoji: '💭' },
  { key: 'sleep', label: 'Sleep quality', emoji: '🌙' },
  { key: 'headache', label: 'Headache', emoji: '💫' },
];

const todayStr = () => new Date().toISOString().split('T')[0];
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Parses a Renpho CSV export. Renpho's export headers vary slightly by
// region/app version, so this matches loosely on common column names:
// Time/Date, Weight(lb|kg), BMI, Body Fat(%), Muscle Mass, etc.
function parseRenphoCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitRow = (row) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === ',' && !inQuotes) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ''));
  };

  const headers = splitRow(lines[0]).map((h) => h.toLowerCase());
  const findCol = (patterns) => headers.findIndex((h) => patterns.some((p) => h.includes(p)));

  const dateIdx = findCol(['time', 'date']);
  const weightIdx = findCol(['weight']);
  const bmiIdx = findCol(['bmi']);
  const bodyFatIdx = findCol(['body fat', 'bodyfat', 'fat(%)', 'fat %']);
  const muscleIdx = findCol(['muscle mass']);
  const visceralIdx = findCol(['visceral']);
  const bmrIdx = findCol(['bmr']);

  if (dateIdx === -1 || weightIdx === -1) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 2) continue;
    const rawDate = cols[dateIdx];
    const parsedDate = new Date(rawDate);
    if (isNaN(parsedDate.getTime())) continue;
    const dateKey = parsedDate.toISOString().split('T')[0];

    const weightRaw = cols[weightIdx];
    const weight = parseFloat(String(weightRaw).replace(/[^\d.]/g, ''));
    if (!weight) continue;
    const unit = /kg/i.test(weightRaw) ? 'kg' : 'lb';

    rows.push({
      date: dateKey,
      weight,
      unit,
      bmi: bmiIdx > -1 ? parseFloat(cols[bmiIdx]) || null : null,
      bodyFat: bodyFatIdx > -1 ? parseFloat(String(cols[bodyFatIdx]).replace(/[^\d.]/g, '')) || null : null,
      muscleMass: muscleIdx > -1 ? parseFloat(String(cols[muscleIdx]).replace(/[^\d.]/g, '')) || null : null,
      visceralFat: visceralIdx > -1 ? parseFloat(cols[visceralIdx]) || null : null,
      bmr: bmrIdx > -1 ? parseFloat(cols[bmrIdx]) || null : null,
    });
  }
  return rows;
}

function Dot({ level }) {
  const colors = ['#EDE7FA', '#D9C9F5', '#B79AEE', '#9068DD', '#6D45C4'];
  return (
    <div style={{
      width: 10, height: 10, borderRadius: '50%',
      background: colors[level] || colors[0],
      display: 'inline-block',
      boxShadow: level > 0 ? '0 0 6px rgba(144,104,221,0.5)' : 'none',
    }} />
  );
}

export default function App() {
  const [entries, setEntries] = useState({});
  const [weightData, setWeightData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [view, setView] = useState('log');
  const [draft, setDraft] = useState({ medication: '', dose: '', doseUnit: 'mg', injectionSite: '', symptoms: {}, notes: '' });
  const [medications, setMedications] = useState(() => {
  try {
    return JSON.parse(localStorage.getItem('glow-log-medications')) || ['Retatrutide'];
  } catch {
    return ['Retatrutide'];
  }
});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [showPngInfo, setShowPngInfo] = useState(false);
  const fileInputRef = useRef(null);

useEffect(() => {
  async function loadData() {
    try {
      const response = await fetch(`${API_URL}/api/state`);
      const cloud = await response.json();

      if (cloud.entries) setEntries(cloud.entries);
      if (cloud.medications) {
  setMedications(cloud.medications);
  localStorage.setItem(
    'glow-log-medications',
    JSON.stringify(cloud.medications)
  );
}
      if (cloud.weightData) setWeightData(cloud.weightData);

      // Keep a local backup too
      localStorage.setItem('glp1-entries', JSON.stringify(cloud.entries || {}));
      localStorage.setItem('glp1-weight-data', JSON.stringify(cloud.weightData || {}));
    } catch (err) {
      // If cloud is unavailable, use the local backup
      try {
        const e = localStorage.getItem('glp1-entries');
        if (e) setEntries(JSON.parse(e));
      } catch (err) {}

      try {
        const w = localStorage.getItem('glp1-weight-data');
        if (w) setWeightData(JSON.parse(w));
      } catch (err) {}
    }

    setLoading(false);
  }

  loadData();
}, []);

  useEffect(() => {
    const existing = entries[selectedDate];
   setDraft(
  existing
    ? { medication: '', ...existing }
    : {
        medication: '',
        dose: '',
        doseUnit: 'mg',
        injectionSite: '',
        symptoms: {},
        notes: ''
      }
);
  }, [selectedDate, entries]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

const saveEntry = async () => {
  const cleanedMedication = draft.medication.trim();

  const hasContent =
    draft.dose ||
    Object.keys(draft.symptoms).length > 0 ||
    draft.notes;

  if (!hasContent) {
    showToast('Nothing to save yet');
    return;
  }

  if (draft.dose && !cleanedMedication) {
    showToast('Enter a medication');
    return;
  }

  setSaving(true);

  const savedDraft = {
    ...draft,
    medication: cleanedMedication,
  };

  const updated = {
    ...entries,
    [selectedDate]: savedDraft,
  };

  const updatedMedications =
    cleanedMedication &&
    !medications.some(
      (med) => med.toLowerCase() === cleanedMedication.toLowerCase()
    )
      ? [...medications, cleanedMedication]
      : medications;

  setEntries(updated);
  setMedications(updatedMedications);

  localStorage.setItem('glp1-entries', JSON.stringify(updated));
  localStorage.setItem(
    'glow-log-medications',
    JSON.stringify(updatedMedications)
  );

  try {
    const cloudResponse = await fetch(`${API_URL}/api/state`);

    if (!cloudResponse.ok) {
      throw new Error(`Cloud load failed: ${cloudResponse.status}`);
    }

    const cloud = await cloudResponse.json();

    const saveResponse = await fetch(`${API_URL}/api/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...cloud,
        entries: updated,
        medications: updatedMedications,
      }),
    });

    if (!saveResponse.ok) {
      throw new Error(`Cloud save failed: ${saveResponse.status}`);
    }

    showToast('Saved ✓');
  } catch (err) {
    console.error(err);
    showToast('Saved locally');
  } finally {
    setSaving(false);
  }
};

const deleteEntry = async (date) => {
  const updated = { ...entries };
  delete updated[date];

  setEntries(updated);
  localStorage.setItem('glp1-entries', JSON.stringify(updated));

  try {
    const cloudResponse = await fetch(`${API_URL}/api/state`);

    if (!cloudResponse.ok) {
      throw new Error(`Cloud load failed: ${cloudResponse.status}`);
    }

    const cloud = await cloudResponse.json();

    const saveResponse = await fetch(`${API_URL}/api/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...cloud,
        entries: updated,
      }),
    });

    if (!saveResponse.ok) {
      throw new Error(`Cloud delete failed: ${saveResponse.status}`);
    }

    showToast('Deleted ✓');
  } catch (err) {
    console.error(err);
    showToast('Deleted locally');
  }
};

  const setSymptom = (key, level) => {
    setDraft((d) => ({ ...d, symptoms: { ...d.symptoms, [key]: level } }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    if (isImage) {
      showToast("PNG auto-read isn't available in this standalone app");
      setShowPngInfo(true);
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      const rows = parseRenphoCSV(text);
      if (rows.length === 0) {
        showToast("Couldn't read that file — check it's a Renpho export");
        setUploading(false);
        e.target.value = '';
        return;
      }
      const merged = { ...weightData };
      rows.forEach((r) => {
        merged[r.date] = {
          weight: r.weight, unit: r.unit, bmi: r.bmi, bodyFat: r.bodyFat,
          muscleMass: r.muscleMass, visceralFat: r.visceralFat, bmr: r.bmr,
        };
      });
      setWeightData(merged);
      localStorage.setItem('glp1-weight-data', JSON.stringify(merged));
      showToast(`Imported ${rows.length} reading${rows.length === 1 ? '' : 's'} ✓`);
    } catch (err) {
      showToast('Upload failed — try again');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const sortedDates = useMemo(
    () => Object.keys(entries).sort((a, b) => b.localeCompare(a)),
    [entries]
  );

  const doseHistory = useMemo(
    () => sortedDates
      .filter((d) => entries[d].dose)
      .slice(0, 6)
      .reverse()
      .map((d) => ({ date: d, dose: parseFloat(entries[d].dose) || 0 })),
    [entries, sortedDates]
  );

  const maxDose = Math.max(1, ...doseHistory.map((d) => d.dose));

  const weightHistory = useMemo(
    () => Object.keys(weightData)
      .sort((a, b) => a.localeCompare(b))
      .slice(-10)
      .map((date) => ({ date, ...weightData[date] })),
    [weightData]
  );
  const minWeight = Math.min(...weightHistory.map((d) => d.weight), Infinity);
  const maxWeight = Math.max(...weightHistory.map((d) => d.weight), 0);
  const weightRange = Math.max(1, maxWeight - minWeight);
  const latestWeight = weightHistory[weightHistory.length - 1];

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #C9B6F0 0%, #B79AEE 35%, #9B7FE8 70%, #8A6EDD 100%)',
        fontFamily: 'system-ui', color: '#fff',
      }}>
        <div>loading the stars…</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #E8DFFC 0%, #D7C6F7 30%, #C4AEF2 60%, #B79AEE 100%)',
      fontFamily: "'Baloo 2', 'Nunito', system-ui, -apple-system, sans-serif",
      paddingBottom: 40,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Quicksand:wght@600;700&display=swap');
        * { box-sizing: border-box; }
        input, textarea { font-family: inherit; }
        input:focus, textarea:focus { outline: none; }
        button { font-family: inherit; cursor: pointer; }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-thumb { background: #B79AEE; border-radius: 10px; }
        @keyframes twinkle { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {[
          { top: '6%', left: '12%', size: 10, delay: '0s' },
          { top: '10%', left: '82%', size: 7, delay: '0.6s' },
          { top: '22%', left: '45%', size: 5, delay: '1.2s' },
          { top: '3%', left: '65%', size: 6, delay: '1.8s' },
          { top: '30%', left: '90%', size: 8, delay: '0.4s' },
          { top: '16%', left: '5%', size: 5, delay: '1s' },
        ].map((s, i) => (
          <Star key={i} size={s.size} fill="#fff" color="#fff"
            style={{ position: 'absolute', top: s.top, left: s.left, animation: `twinkle 2.4s ease-in-out infinite`, animationDelay: s.delay, opacity: 0.7 }}
          />
        ))}
      </div>

      <div style={{ padding: '30px 20px 18px', textAlign: 'center', position: 'relative' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 10px',
          background: 'linear-gradient(135deg, #FFE9A8, #FFD166)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(255, 209, 102, 0.5), inset 0 -3px 6px rgba(0,0,0,0.06)',
        }}>
          <Moon size={26} color="#8A6EDD" fill="#8A6EDD" />
        </div>
        <h1 style={{
          fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 24,
          color: '#fff', margin: 0, letterSpacing: 0.2,
          textShadow: '0 2px 10px rgba(109, 69, 196, 0.4)',
        }}>
          Glow Log
        </h1>
        <p style={{ color: '#F0EAFC', fontSize: 13, margin: '4px 0 0', fontWeight: 600 }}>
          your GLP-1 journey, written in the stars ✨
        </p>
        <a href="#fit" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
          padding: '6px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.22)',
          color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none',
          backdropFilter: 'blur(6px)',
        }}>
          🏋️ Fit Log — bike rides & gym sessions →
        </a>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20, position: 'relative' }}>
        {[['log', 'Log'], ['history', 'History']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              padding: '9px 24px', borderRadius: 20, border: 'none',
              background: view === key ? '#fff' : 'rgba(255,255,255,0.25)',
              color: view === key ? '#8A6EDD' : '#fff',
              fontWeight: 700, fontSize: 13, transition: 'all 0.2s',
              boxShadow: view === key ? '0 4px 14px rgba(109,69,196,0.25)' : 'none',
              backdropFilter: 'blur(6px)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.png,image/png"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 16, border: '1.5px dashed rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            fontWeight: 700, fontSize: 12, backdropFilter: 'blur(6px)',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <Upload size={13} />
          {uploading ? 'Reading file…' : 'Upload Renpho CSV'}
        </button>
        {showPngInfo && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 6, maxWidth: 320,
            fontSize: 11, color: '#F0EAFC', background: 'rgba(0,0,0,0.15)',
            padding: '8px 12px', borderRadius: 12, textAlign: 'left',
          }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>PNG screenshot reading needs Claude's AI and only works inside the Claude chat artifact — export a CSV from Renpho instead for this app.</span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px', position: 'relative' }}>
        {view === 'log' ? (
          <>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
              {Array.from({ length: 7 }).map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                const dStr = d.toISOString().split('T')[0];
                const isSelected = dStr === selectedDate;
                const hasEntry = !!entries[dStr];
                return (
                  <button
                    key={dStr}
                    onClick={() => setSelectedDate(dStr)}
                    style={{
                      flex: '0 0 auto', padding: '8px 14px', borderRadius: 14,
                      border: isSelected ? '2px solid #fff' : '2px solid transparent',
                      background: isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.28)',
                      color: isSelected ? '#8A6EDD' : '#fff',
                      fontWeight: 700, fontSize: 12, position: 'relative',
                      backdropFilter: 'blur(6px)',
                      boxShadow: isSelected ? '0 4px 14px rgba(109,69,196,0.25)' : 'none',
                    }}
                  >
                    {fmtDate(dStr)}
                    {hasEntry && (
                      <span style={{
                        position: 'absolute', top: 4, right: 6, width: 5, height: 5,
                        borderRadius: '50%', background: isSelected ? '#8A6EDD' : '#fff',
                      }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Manual date picker for backfilling entries older than 7 days */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
              background: 'rgba(255,255,255,0.28)', borderRadius: 14, padding: '8px 12px',
              backdropFilter: 'blur(6px)',
            }}>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>
                Log an earlier date:
              </span>
              <input
                type="date"
                value={selectedDate}
                max={todayStr()}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                style={{
                  flex: 1, border: 'none', borderRadius: 10, padding: '6px 10px',
                  fontSize: 12, fontWeight: 600, color: '#6D45C4', background: 'rgba(255,255,255,0.9)',
                }}
              />
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.9)', borderRadius: 24, padding: 18, marginBottom: 14,
              boxShadow: '0 8px 24px rgba(109,69,196,0.18)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.6)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
  <Syringe size={16} color="#8A6EDD" />
  <span style={{ fontWeight: 800, color: '#6D45C4', fontSize: 14 }}>Injection</span>
</div>

<input
  type="text"
  list="medication-options"
  placeholder="Medication"
  value={draft.medication}
  onChange={(e) =>
    setDraft((d) => ({ ...d, medication: e.target.value }))
  }
  style={{
    width: '100%',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1.5px solid #E4D9FA',
    fontSize: 14,
    color: '#5B4285',
    background: '#FBF9FF',
    marginBottom: 10,
  }}
/>
<datalist id="medication-options">
  {medications.map((med) => (
    <option key={med} value={med} />
  ))}
</datalist>
<div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  type="number"
                  step="0.25"
                  placeholder="Dose"
                  value={draft.dose}
                  onChange={(e) => setDraft((d) => ({ ...d, dose: e.target.value }))}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E4D9FA',
                    fontSize: 14, color: '#5B4285', background: '#FBF9FF',
                  }}
                />
                <select
                  value={draft.doseUnit}
                  onChange={(e) => setDraft((d) => ({ ...d, doseUnit: e.target.value }))}
                  style={{
                    padding: '10px 12px', borderRadius: 12, border: '1.5px solid #E4D9FA',
                    fontSize: 14, color: '#5B4285', background: '#FBF9FF',
                  }}
                >
                  <option value="mg">mg</option>
                  <option value="units">units</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Injection site (e.g. left thigh)"
                value={draft.injectionSite}
                onChange={(e) => setDraft((d) => ({ ...d, injectionSite: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E4D9FA',
                  fontSize: 14, color: '#5B4285', background: '#FBF9FF',
                }}
              />
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.9)', borderRadius: 24, padding: 18, marginBottom: 14,
              boxShadow: '0 8px 24px rgba(109,69,196,0.18)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.6)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Sparkles size={14} color="#8A6EDD" />
                <span style={{ fontWeight: 800, color: '#6D45C4', fontSize: 14 }}>Symptoms</span>
              </div>
              <div style={{ fontSize: 11, color: '#9B85C9', marginBottom: 12 }}>tap a dot: 0 none — 4 severe</div>
              {SYMPTOMS.map((s) => (
                <div key={s.key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid #F1EBFC',
                }}>
                  <span style={{ fontSize: 13, color: '#5B4285', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{s.emoji}</span>{s.label}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[0, 1, 2, 3, 4].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setSymptom(s.key, lvl)}
                        style={{
                          width: 20, height: 20, borderRadius: '50%', border: 'none',
                          background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transform: draft.symptoms[s.key] === lvl ? 'scale(1.3)' : 'scale(1)',
                          transition: 'transform 0.15s',
                        }}
                      >
                        <Dot level={draft.symptoms[s.key] >= lvl ? lvl + 1 : 0} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.9)', borderRadius: 24, padding: 18, marginBottom: 16,
              boxShadow: '0 8px 24px rgba(109,69,196,0.18)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.6)',
            }}>
              <div style={{ fontWeight: 800, color: '#6D45C4', fontSize: 14, marginBottom: 10 }}>Notes</div>
              <textarea
                placeholder="anything else worth remembering..."
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E4D9FA',
                  fontSize: 13, color: '#5B4285', background: '#FBF9FF', resize: 'none',
                }}
              />
            </div>

            <button
              onClick={saveEntry}
              disabled={saving}
              style={{
                width: '100%', padding: 14, borderRadius: 18, border: 'none',
                background: 'linear-gradient(135deg, #B79AEE, #8A6EDD)',
                color: '#fff', fontWeight: 800, fontSize: 15,
                boxShadow: '0 6px 20px rgba(109,69,196,0.4)',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : `✨ Save ${fmtDate(selectedDate)}`}
            </button>
          </>
        ) : (
          <>
            {weightHistory.length > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.9)', borderRadius: 24, padding: 18, marginBottom: 16,
                boxShadow: '0 8px 24px rgba(109,69,196,0.18)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.6)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Scale size={16} color="#8A6EDD" />
                    <span style={{ fontWeight: 800, color: '#6D45C4', fontSize: 14 }}>Weight (Renpho)</span>
                  </div>
                  {latestWeight && (
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#6D45C4' }}>
                      {latestWeight.weight} {latestWeight.unit}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
                  {weightHistory.map((d) => (
                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: '100%', maxWidth: 22, borderRadius: 6,
                        height: `${10 + ((d.weight - minWeight) / weightRange) * 55}px`,
                        background: 'linear-gradient(180deg, #FFE9A8, #8A6EDD)',
                      }} />
                      <div style={{ fontSize: 9, color: '#9B85C9' }}>{fmtDate(d.date)}</div>
                    </div>
                  ))}
                </div>
                {latestWeight && (latestWeight.bmi || latestWeight.bodyFat) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {latestWeight.bmi && (
                      <span style={{ fontSize: 11, background: '#EFE7FC', color: '#6D45C4', padding: '4px 8px', borderRadius: 10, fontWeight: 600 }}>
                        BMI {latestWeight.bmi}
                      </span>
                    )}
                    {latestWeight.bodyFat && (
                      <span style={{ fontSize: 11, background: '#EFE7FC', color: '#6D45C4', padding: '4px 8px', borderRadius: 10, fontWeight: 600 }}>
                        Body fat {latestWeight.bodyFat}%
                      </span>
                    )}
                    {latestWeight.muscleMass && (
                      <span style={{ fontSize: 11, background: '#EFE7FC', color: '#6D45C4', padding: '4px 8px', borderRadius: 10, fontWeight: 600 }}>
                        Muscle {latestWeight.muscleMass}
                      </span>
                    )}
                    {latestWeight.visceralFat && (
                      <span style={{ fontSize: 11, background: '#EFE7FC', color: '#6D45C4', padding: '4px 8px', borderRadius: 10, fontWeight: 600 }}>
                        Visceral fat {latestWeight.visceralFat}
                      </span>
                    )}
                    {latestWeight.bmr && (
                      <span style={{ fontSize: 11, background: '#EFE7FC', color: '#6D45C4', padding: '4px 8px', borderRadius: 10, fontWeight: 600 }}>
                        BMR {latestWeight.bmr} kcal
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {doseHistory.length > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.9)', borderRadius: 24, padding: 18, marginBottom: 16,
                boxShadow: '0 8px 24px rgba(109,69,196,0.18)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.6)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <TrendingUp size={16} color="#8A6EDD" />
                  <span style={{ fontWeight: 800, color: '#6D45C4', fontSize: 14 }}>Dose trend</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 90 }}>
                  {doseHistory.map((d) => (
                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 10, color: '#6D45C4', fontWeight: 700 }}>{d.dose}</div>
                      <div style={{
                        width: '100%', maxWidth: 28, borderRadius: 8,
                        height: `${Math.max(10, (d.dose / maxDose) * 60)}px`,
                        background: 'linear-gradient(180deg, #D9C9F5, #8A6EDD)',
                      }} />
                      <div style={{ fontSize: 10, color: '#9B85C9' }}>{fmtDate(d.date)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sortedDates.length === 0 ? (
              <div style={{
                textAlign: 'center', color: '#fff', padding: '48px 20px', fontSize: 14,
                background: 'rgba(255,255,255,0.15)', borderRadius: 24, backdropFilter: 'blur(6px)',
              }}>
                <Star size={22} fill="#fff" style={{ marginBottom: 8, opacity: 0.9 }} />
                <div>No entries yet — log your first dose or symptom day ✨</div>
              </div>
            ) : (
              sortedDates.map((date) => {
                const e = entries[date];
                const activeSymptoms = Object.entries(e.symptoms || {}).filter(([, v]) => v > 0);
                return (
                  <div key={date} style={{
                    background: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 16, marginBottom: 12,
                    boxShadow: '0 6px 18px rgba(109,69,196,0.14)', position: 'relative',
                    backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.6)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 800, color: '#6D45C4', fontSize: 14 }}>{fmtDate(date)}</div>
                      <button
                        onClick={() => deleteEntry(date)}
                        style={{ background: 'none', border: 'none', color: '#C6B4EC', padding: 4 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {e.dose && (
                      <div style={{ fontSize: 12, color: '#5B4285', marginTop: 6 }}>
                       💉 {e.medication ? `${e.medication} · ` : ''}{e.dose} {e.doseUnit}{e.injectionSite ? ` · ${e.injectionSite}` : ''}
                      </div>
                    )}
                    {activeSymptoms.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {activeSymptoms.map(([key, lvl]) => {
                          const s = SYMPTOMS.find((x) => x.key === key);
                          return (
                            <span key={key} style={{
                              fontSize: 11, background: '#EFE7FC', color: '#6D45C4',
                              padding: '4px 8px', borderRadius: 10, fontWeight: 600,
                            }}>
                              {s?.emoji} {s?.label} {lvl}/4
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {e.notes && (
                      <div style={{ fontSize: 12, color: '#8570A8', marginTop: 8, fontStyle: 'italic' }}>
                        “{e.notes}”
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#6D45C4', color: '#fff', padding: '10px 20px', borderRadius: 20,
          fontSize: 13, fontWeight: 700, boxShadow: '0 6px 20px rgba(109,69,196,0.5)',
          display: 'flex', alignItems: 'center', gap: 6, zIndex: 10, maxWidth: '85%', textAlign: 'center',
        }}>
          <Sparkles size={13} style={{ flexShrink: 0 }} /> {toast}
        </div>
      )}
    </div>
  );
}
