import React, { useState, useEffect, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';

const Synth = () => {
  const [audioContext] = useState(() => new (window.AudioContext || window.webkitAudioContext)());
  const [rootNote, setRootNote] = useState('C');
  const [scaleType, setScaleType] = useState('chromatic');
  const [octave, setOctave] = useState(4);
  const [volume, setVolume] = useState(0.5);
  const [waveform, setWaveform] = useState('sine');
  const [harshness, setHarshness] = useState(0);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const activeOscillators = useRef({});
  const animationFrameId = useRef(null);

  const baseFrequencies = {
    'A': 440.00,
    'A#': 466.16,
    'B': 493.88,
    'C': 523.25,
    'C#': 554.37,
    'D': 587.33,
    'D#': 622.25,
    'E': 659.25,
    'F': 698.46,
    'F#': 739.99,
    'G': 783.99,
    'G#': 830.61
  };

  const scaleIntervals = {
    'chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    'major': [0, 2, 4, 5, 7, 9, 11, 12],
    'minor': [0, 2, 3, 5, 7, 8, 10, 12],
    'pentatonic': [0, 2, 4, 7, 9, 12],
    'blues': [0, 3, 5, 6, 7, 10, 12]
  };

  const keyMap = {
    'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5, 't': 6, 'g': 7,
    'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12
  };
  
  const nonChromaticKeyMap = {
    'a': 0, 's': 1, 'd': 2, 'f': 3, 'g': 4, 'h': 5, 'j': 6, 'k': 7
  };

  const calculateScale = () => {
    const rootFreq = baseFrequencies[rootNote] * Math.pow(2, octave - 4);
    return scaleIntervals[scaleType].map(interval => 
      rootFreq * Math.pow(2, interval / 12)
    );
  };

  useEffect(() => {
    analyserRef.current = audioContext.createAnalyser();
    analyserRef.current.connect(audioContext.destination);
    analyserRef.current.fftSize = 256;
    
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  const drawVisualization = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      ctx.fillStyle = 'rgb(15, 23, 42)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = canvas.width / bufferLength * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const hue = (i / bufferLength) * 360;
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.8)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    
    draw();
  };

  useEffect(() => {
    drawVisualization();
  }, []);

  const createOscillator = (frequency) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const distortion = audioContext.createWaveShaper();
    
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    
    const makeDistortionCurve = (amount) => {
      const k = typeof amount === 'number' ? amount : 50;
      const n_samples = 44100;
      const curve = new Float32Array(n_samples);
      const deg = Math.PI / 180;
      
      for (let i = 0; i < n_samples; i++) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
      }
      return curve;
    };
    
    distortion.curve = makeDistortionCurve(harshness * 400);
    
    oscillator.connect(distortion);
    distortion.connect(gainNode);
    gainNode.connect(analyserRef.current);
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    
    return { oscillator, gainNode };
  };

  const startNote = (frequency) => {
    if (!frequency) return;
    if (activeOscillators.current[frequency]) return;
    
    const { oscillator, gainNode } = createOscillator(frequency);
    activeOscillators.current[frequency] = { oscillator, gainNode };
    oscillator.start();
  };

  const stopNote = (frequency) => {
    if (!activeOscillators.current[frequency]) return;
    
    const { oscillator, gainNode } = activeOscillators.current[frequency];
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    oscillator.stop(audioContext.currentTime + 0.1);
    delete activeOscillators.current[frequency];
  };

  const handleKeyDown = (e) => {
    if (e.repeat) return;
    
    // Handle octave changes
    if (e.key === 'n') {
      setOctave(prev => Math.max(2, prev - 1));
      return;
    }
    if (e.key === 'm') {
      setOctave(prev => Math.min(6, prev + 1));
      return;
    }
    
    const currentScale = calculateScale();
    const noteIndex = scaleType === 'chromatic' ? keyMap[e.key] : nonChromaticKeyMap[e.key];
    if (noteIndex === undefined || !currentScale[noteIndex]) return;
    
    startNote(currentScale[noteIndex]);
  };
  
  const handleKeyUp = (e) => {
    const currentScale = calculateScale();
    const noteIndex = scaleType === 'chromatic' ? keyMap[e.key] : nonChromaticKeyMap[e.key];
    if (noteIndex === undefined || !currentScale[noteIndex]) return;
    
    stopNote(currentScale[noteIndex]);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [rootNote, scaleType, octave, volume, waveform, harshness]);

  return (
    <div className="p-6 min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center">
      <Card className="w-full max-w-3xl p-8 bg-slate-800 rounded-xl shadow-xl border border-slate-700">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-50">
              🎹 Synthwave
            </h2>
            <div className="flex gap-4">
              <Select value={rootNote} onValueChange={setRootNote}>
                <SelectTrigger className="w-24 bg-slate-700 border-slate-600 text-slate-50">
                  <SelectValue className="text-slate-50" placeholder="Root" />
                </SelectTrigger>
                <SelectContent className="text-slate-50 bg-slate-700 border-slate-600">
                  {Object.keys(baseFrequencies).map(note => (
                    <SelectItem key={note} value={note} className="text-slate-50 hover:bg-slate-600 focus:bg-slate-600">
                      {note}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={scaleType} onValueChange={setScaleType}>
                <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-slate-50">
                  <SelectValue className="text-slate-50" placeholder="Scale" />
                </SelectTrigger>
                <SelectContent className="text-slate-50 bg-slate-700 border-slate-600">
                  {Object.keys(scaleIntervals).map(scale => (
                    <SelectItem key={scale} value={scale} className="text-slate-50 hover:bg-slate-600 focus:bg-slate-600">
                      {scale.charAt(0).toUpperCase() + scale.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={octave.toString()} onValueChange={(v) => setOctave(parseInt(v))}>
                <SelectTrigger className="w-24 bg-slate-700 border-slate-600 text-slate-50">
                  <SelectValue className="text-slate-50" placeholder="Octave" />
                </SelectTrigger>
                <SelectContent className="text-slate-50 bg-slate-700 border-slate-600">
                  {[2, 3, 4, 5, 6].map(oct => (
                    <SelectItem key={oct} value={oct.toString()} className="text-slate-50 hover:bg-slate-600 focus:bg-slate-600">
                      Oct {oct}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <canvas 
            ref={canvasRef} 
            width="600" 
            height="150" 
            className="w-full rounded-lg bg-slate-900 border border-slate-700"
          />

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-slate-400">🌊</span>
              <Select value={waveform} onValueChange={setWaveform}>
                <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-slate-50">
                  <SelectValue className="text-slate-50" />
                </SelectTrigger>
                <SelectContent className="text-slate-50 bg-slate-700 border-slate-600">
                  <SelectItem value="sine" className="text-slate-50 hover:bg-slate-600 focus:bg-slate-600">Sine</SelectItem>
                  <SelectItem value="square" className="text-slate-50 hover:bg-slate-600 focus:bg-slate-600">Square</SelectItem>
                  <SelectItem value="sawtooth" className="text-slate-50 hover:bg-slate-600 focus:bg-slate-600">Sawtooth</SelectItem>
                  <SelectItem value="triangle" className="text-slate-50 hover:bg-slate-600 focus:bg-slate-600">Triangle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">🔊</span>
                <span className="text-sm text-slate-400">Volume</span>
              </div>
              <Slider
                value={[volume]}
                onValueChange={([v]) => setVolume(v)}
                max={1}
                step={0.01}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Harshness</span>
              </div>
              <Slider
                value={[harshness]}
                onValueChange={([v]) => setHarshness(v)}
                max={1}
                step={0.01}
                className="w-full"
              />
            </div>
          </div>

          <div className="mt-4 p-4 bg-slate-700 rounded-lg flex items-start gap-2">
            <span className="text-slate-300 mt-0.5">ℹ️</span>
            <p className="text-sm text-slate-300">
              Use your keyboard (A-K and W,E,T,Y,U) to play notes. Keys are mapped in a piano-like layout. Use 'N' and 'M' to change octaves.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Synth;
