import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  advanceRepTracker,
  analyzeExercisePose,
  assessFraming,
  EXERCISES,
  getLandmarkVisibility,
} from '../utils/postureAnalysis';

const VISION_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 31], [28, 32],
];

function drawPose(canvas, video, landmarks) {
  if (!canvas || !video.videoWidth || !video.videoHeight) return;

  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.round(bounds.width * pixelRatio);
  const height = Math.round(bounds.height * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (!landmarks?.length) return;
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const offsetX = (width - video.videoWidth * scale) / 2;
  const offsetY = (height - video.videoHeight * scale) / 2;
  const point = (index) => ({
    x: (1 - landmarks[index].x) * video.videoWidth * scale + offsetX,
    y: landmarks[index].y * video.videoHeight * scale + offsetY,
  });

  context.strokeStyle = '#a3e635';
  context.lineWidth = Math.max(2, pixelRatio * 3);
  CONNECTIONS.forEach(([start, end]) => {
    if (getLandmarkVisibility(landmarks[start]) < 0.4 || getLandmarkVisibility(landmarks[end]) < 0.4) return;
    const first = point(start);
    const last = point(end);
    context.beginPath();
    context.moveTo(first.x, first.y);
    context.lineTo(last.x, last.y);
    context.stroke();
  });

  context.fillStyle = '#f8fafc';
  landmarks.forEach((landmark, index) => {
    if (getLandmarkVisibility(landmark) < 0.4) return;
    const position = point(index);
    context.beginPath();
    context.arc(position.x, position.y, Math.max(3, pixelRatio * 4), 0, Math.PI * 2);
    context.fill();
  });
}

export default function PostureCoachPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const frameRequestRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const lastSpokenRef = useRef({ text: '', time: 0 });
  const angleSamplesRef = useRef([]);
  const trackerRef = useRef({ phase: 'waiting', reps: 0 });
  const [selectedExercise, setSelectedExercise] = useState('squat');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [framing, setFraming] = useState({ ready: false, message: 'Camera is off. Start the camera to check your view.' });
  const [reps, setReps] = useState(0);
  const [angle, setAngle] = useState(null);
  const [formCue, setFormCue] = useState('');

  const stopCamera = () => {
    if (frameRequestRef.current) cancelAnimationFrame(frameRequestRef.current);
    frameRequestRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setModelReady(false);
    setIsCameraOn(false);
    setFraming({ ready: false, message: 'Camera stopped. Video was processed locally and was not uploaded.' });
    setAngle(null);
    setFormCue('');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const startCamera = async () => {
    setModelError('');
    setFraming({ ready: false, message: 'Requesting camera access…' });
    if (!navigator.mediaDevices?.getUserMedia) {
      setFraming({ ready: false, message: 'Camera access is unavailable. Use a supported browser on localhost or HTTPS.' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('The camera preview is not ready.');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsCameraOn(true);
      setFraming({ ready: false, message: 'Loading the on-device pose model…' });
    } catch (cameraError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setFraming({
        ready: false,
        message: cameraError.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
          : cameraError.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : `Unable to open the camera: ${cameraError.message}`,
      });
    }
  };

  useEffect(() => {
    if (!isCameraOn) return undefined;
    let cancelled = false;
    let landmarker;

    async function loadModel() {
      try {
        const files = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
        landmarker = await PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setModelReady(true);
        setFraming({ ready: false, message: 'Pose model ready. Stand in view while the camera checks your framing.' });
      } catch (error) {
        if (!cancelled) {
          setModelError(`Pose model could not be loaded: ${error.message}. Check your internet connection and try again.`);
          setFraming({ ready: false, message: 'Pose assessment is unavailable until the model loads.' });
        }
      }
    }

    loadModel();
    return () => {
      cancelled = true;
      if (landmarker && landmarkerRef.current === landmarker) {
        landmarker.close();
        landmarkerRef.current = null;
      }
    };
  }, [isCameraOn]);

  useEffect(() => {
    if (!isCameraOn || !modelReady) return undefined;
    let active = true;

    const processFrame = () => {
      if (!active) return;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const now = performance.now();

      if (video && landmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastFrameTimeRef.current >= 100) {
        lastFrameTimeRef.current = now;
        try {
          const result = landmarker.detectForVideo(video, now);
          const landmarks = result.landmarks[0];
          const assessment = assessFraming(landmarks, selectedExercise, video.videoWidth / video.videoHeight);
          setFraming(assessment);
          drawPose(canvasRef.current, video, landmarks);

          if (assessment.ready && landmarks) {
            const metrics = analyzeExercisePose(landmarks, selectedExercise, assessment.side, video.videoWidth / video.videoHeight);
            if (metrics) {
              angleSamplesRef.current = [...angleSamplesRef.current, metrics.angle].slice(-5);
              const smoothedAngle = angleSamplesRef.current.reduce((sum, value) => sum + value, 0) / angleSamplesRef.current.length;
              const nextTracker = advanceRepTracker(trackerRef.current, smoothedAngle, selectedExercise);
              trackerRef.current = nextTracker;
              setReps(nextTracker.reps);
              setAngle(Math.round(smoothedAngle));
              setFormCue(metrics.cue);
            }
          } else {
            angleSamplesRef.current = [];
            setAngle(null);
            setFormCue('');
          }
        } catch (error) {
          setModelError(`Pose analysis stopped: ${error.message}`);
          setFraming({ ready: false, message: 'Unable to analyze this camera frame. Stop and restart the camera to try again.' });
          return;
        }
      }

      frameRequestRef.current = requestAnimationFrame(processFrame);
    };

    frameRequestRef.current = requestAnimationFrame(processFrame);
    return () => {
      active = false;
      if (frameRequestRef.current) cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    };
  }, [isCameraOn, modelReady, selectedExercise]);

  useEffect(() => {
    if (!isCameraOn || !audioEnabled || !framing.message || !window.speechSynthesis) return;
    const text = framing.ready && formCue ? formCue : framing.message;
    const now = Date.now();
    if (now - lastSpokenRef.current.time < 3500 || text === lastSpokenRef.current.text) return;

    lastSpokenRef.current = { text, time: now };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [audioEnabled, framing, formCue, isCameraOn]);

  useEffect(() => () => {
    if (frameRequestRef.current) cancelAnimationFrame(frameRequestRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  const handleExerciseChange = (event) => {
    trackerRef.current = { phase: 'waiting', reps: 0 };
    angleSamplesRef.current = [];
    setReps(0);
    setAngle(null);
    setFormCue('');
    setSelectedExercise(event.target.value);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const handleAudioChange = (event) => {
    setAudioEnabled(event.target.checked);
    if (!event.target.checked && window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const feedbackMessage = modelError || (framing.ready && formCue ? formCue : framing.message);
  const statusColor = framing.ready ? 'border-lime-500/20 bg-lime-500/10 text-lime-50' : 'border-amber-500/20 bg-amber-500/10 text-amber-100';

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Vision</div>
        <h1 className="mt-2 text-3xl font-bold text-white">Smart posture coach</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">On-device pose estimation checks your camera view before giving basic exercise cues. Keep your camera still and follow the view guidance for your selected exercise.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Live pose and camera view</div>
            <div className={`rounded-full px-2 py-1 text-xs font-medium ${isCameraOn ? 'bg-lime-500/10 text-lime-200' : 'bg-slate-700 text-slate-300'}`}>{isCameraOn ? 'Camera on' : 'Camera off'}</div>
          </div>
          <div className="relative flex aspect-video min-h-[280px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-700 bg-slate-950">
            <video ref={videoRef} autoPlay playsInline muted aria-label="Local camera preview" className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${isCameraOn ? 'block' : 'hidden'}`} />
            <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 h-full w-full ${isCameraOn ? 'block' : 'hidden'}`} />
            {!isCameraOn ? <span className="px-6 text-center text-slate-400">Start the camera to check your exercise view.</span> : null}
          </div>
          <div className="mt-4 flex gap-3">
            <button type="button" disabled={isCameraOn} onClick={startCamera} className="rounded-xl bg-lime-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-50">Start camera</button>
            <button type="button" disabled={!isCameraOn} onClick={stopCamera} className="rounded-xl border border-slate-600 px-4 py-2 font-medium text-slate-200 disabled:opacity-50">Stop camera</button>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div>
            <label htmlFor="exercise-select" className="mb-1 block text-sm text-slate-300">Exercise</label>
            <select id="exercise-select" value={selectedExercise} onChange={handleExerciseChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
              {Object.entries(EXERCISES).map(([value, exercise]) => <option key={value} value={value}>{exercise.label}</option>)}
            </select>
          </div>
          <div className="rounded-2xl bg-slate-800/70 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Assessment</div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-bold text-white">{reps}</div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Reps</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold text-white">
                  {angle === null ? '--' : selectedExercise === 'headRotation' ? `${Math.round(Math.abs(angle) * 100)}%` : `${angle}°`}
                </div>
                <div className="text-xs uppercase tracking-wide text-slate-400">{selectedExercise === 'headRotation' ? 'Head offset' : 'Joint angle'}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-400">{framing.ready ? 'Assessment active. Repetitions are estimated from pose landmarks.' : 'Assessment pauses until the required landmarks are visible.'}</p>
          </div>
          <div role="status" aria-live="polite" className={`rounded-2xl border p-4 text-sm ${statusColor}`}>{feedbackMessage}</div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={audioEnabled} onChange={handleAudioChange} className="accent-lime-400" />
            Speak camera and posture guidance
          </label>
          <p className="text-xs leading-relaxed text-slate-500">Video is analyzed locally in this browser and is not uploaded or saved. The pose model is downloaded when needed. This is a basic, non-clinical guide: camera angle and pose-estimation errors can affect results. Stop if you feel pain.</p>
        </section>
      </div>
    </div>
  );
}
