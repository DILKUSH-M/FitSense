export const EXERCISES = {
  squat: {
    label: 'Squat',
    view: 'Use a side-on view and keep your head, hip, knee, and ankle in frame.',
    viewType: 'side',
    landmarks: {
      left: [11, 23, 25, 27],
      right: [12, 24, 26, 28],
    },
    topAngle: 160,
    bottomAngle: 105,
  },
  pushup: {
    label: 'Push-up',
    view: 'Use a side-on view and keep your shoulder, elbow, wrist, hip, and ankle in frame.',
    viewType: 'side',
    landmarks: {
      left: [11, 13, 15, 23, 27],
      right: [12, 14, 16, 24, 28],
    },
    topAngle: 155,
    bottomAngle: 95,
  },
  curl: {
    label: 'Biceps curl',
    view: 'Use a side-on view and keep your shoulder, elbow, wrist, and hip in frame.',
    viewType: 'side',
    landmarks: {
      left: [11, 13, 15, 23],
      right: [12, 14, 16, 24],
    },
    topAngle: 150,
    bottomAngle: 65,
  },
  headRotation: {
    label: 'Head rotation',
    view: 'Face the camera at eye level and keep your head and both shoulders in frame.',
    viewType: 'front',
    landmarks: {
      left: [0, 11, 12],
      right: [0, 11, 12],
    },
    minFrameSize: 0.18,
    turnThreshold: 0.12,
    centerThreshold: 0.05,
  },
};

const JOINT_NAMES = {
  0: 'head',
  11: 'shoulder',
  12: 'shoulder',
  13: 'elbow',
  14: 'elbow',
  15: 'wrist',
  16: 'wrist',
  23: 'hip',
  24: 'hip',
  25: 'knee',
  26: 'knee',
  27: 'ankle',
  28: 'ankle',
};

const VISIBILITY_THRESHOLD = 0.55;

function visibility(landmark) {
  return landmark?.visibility ?? landmark?.presence ?? 0;
}

export function calculateAngle(first, vertex, last, aspectRatio = 1) {
  const ax = (first.x - vertex.x) * aspectRatio;
  const ay = first.y - vertex.y;
  const bx = (last.x - vertex.x) * aspectRatio;
  const by = last.y - vertex.y;
  const magnitude = Math.hypot(ax, ay) * Math.hypot(bx, by);

  if (!magnitude) return 0;

  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / magnitude));
  return Math.acos(cosine) * (180 / Math.PI);
}

export function assessFraming(landmarks, exercise, aspectRatio = 16 / 9) {
  if (!landmarks?.length) {
    return { ready: false, side: null, message: 'Step into view so the camera can find your body.' };
  }

  if (visibility(landmarks[0]) < VISIBILITY_THRESHOLD) {
    return { ready: false, side: null, message: 'Move into view and keep your head visible.' };
  }

  const config = EXERCISES[exercise];
  const sideScores = Object.entries(config.landmarks).map(([side, required]) => ({
    side,
    score: required.reduce((total, index) => total + visibility(landmarks[index]), 0) / required.length,
  }));
  const side = sideScores.sort((a, b) => b.score - a.score)[0].side;
  const required = config.landmarks[side];
  const missing = required.filter((index) => visibility(landmarks[index]) < VISIBILITY_THRESHOLD);

  if (missing.length) {
    const jointNames = [...new Set(missing.map((index) => JOINT_NAMES[index]))];
    return {
      ready: false,
      side,
      message: `Adjust the camera so your ${jointNames.join(', ')}${jointNames.length > 1 ? ' are' : ' is'} clearly visible.`,
    };
  }

  const bilateralTorsoVisible = [11, 12, 23, 24].every(
    (index) => visibility(landmarks[index]) >= 0.45,
  );
  if (config.viewType === 'side' && bilateralTorsoVisible) {
    const shoulderSpan = Math.abs(landmarks[11].x - landmarks[12].x) * aspectRatio;
    const hipSpan = Math.abs(landmarks[23].x - landmarks[24].x) * aspectRatio;
    const shoulderCenter = {
      x: (landmarks[11].x + landmarks[12].x) / 2,
      y: (landmarks[11].y + landmarks[12].y) / 2,
    };
    const hipCenter = {
      x: (landmarks[23].x + landmarks[24].x) / 2,
      y: (landmarks[23].y + landmarks[24].y) / 2,
    };
    const torsoLength = Math.hypot(
      (shoulderCenter.x - hipCenter.x) * aspectRatio,
      shoulderCenter.y - hipCenter.y,
    );

    if (torsoLength > 0 && Math.max(shoulderSpan, hipSpan) / torsoLength > 0.9) {
      return { ready: false, side, message: 'The view may be too front-on. Turn sideways so the joint angles are easier to assess.' };
    }
  }

  const visible = [...new Set([0, ...required])]
    .map((index) => landmarks[index])
    .filter((landmark) => visibility(landmark) >= 0.4);
  const minX = Math.min(...visible.map((landmark) => landmark.x));
  const maxX = Math.max(...visible.map((landmark) => landmark.x));
  const minY = Math.min(...visible.map((landmark) => landmark.y));
  const maxY = Math.max(...visible.map((landmark) => landmark.y));

  if (minY < 0.03 || maxY > 0.97 || minX < 0.02 || maxX > 0.98) {
    return { ready: false, side, message: 'Step back or recenter so your whole body has space around it.' };
  }

  if (Math.max(maxX - minX, maxY - minY) < (config.minFrameSize || 0.4)) {
    return { ready: false, side, message: 'Move closer to the camera so your body is easier to assess.' };
  }

  return { ready: true, side, message: `View looks usable. ${config.view}` };
}

export function analyzeExercisePose(landmarks, exercise, side, aspectRatio = 1) {
  const config = EXERCISES[exercise];
  const sideLandmarks = config.landmarks[side];

  if (sideLandmarks.some((index) => visibility(landmarks[index]) < VISIBILITY_THRESHOLD)) {
    return null;
  }

  if (exercise === 'headRotation') {
    const shoulderSpan = Math.abs(landmarks[11].x - landmarks[12].x) * aspectRatio;
    if (shoulderSpan < 0.01) return null;

    const shoulderCenter = (landmarks[11].x + landmarks[12].x) / 2;
    const offset = ((landmarks[0].x - shoulderCenter) * aspectRatio) / shoulderSpan;
    return {
      angle: offset,
      cue: Math.abs(offset) >= config.turnThreshold
        ? 'Return your head gently to the center.'
        : 'Turn your head gently to either side.',
    };
  }

  let angle;
  let cue = '';

  if (exercise === 'squat') {
    const [shoulderIndex, hipIndex, kneeIndex, ankleIndex] = sideLandmarks;
    angle = calculateAngle(landmarks[hipIndex], landmarks[kneeIndex], landmarks[ankleIndex], aspectRatio);

    const torsoLean = Math.atan2(
      Math.abs(landmarks[shoulderIndex].x - landmarks[hipIndex].x) * aspectRatio,
      Math.abs(landmarks[shoulderIndex].y - landmarks[hipIndex].y),
    ) * (180 / Math.PI);
    if (torsoLean > 55) cue = 'Keep your chest lifted as you rise.';
  } else if (exercise === 'pushup') {
    const [shoulderIndex, elbowIndex, wristIndex, hipIndex, ankleIndex] = sideLandmarks;
    angle = calculateAngle(landmarks[shoulderIndex], landmarks[elbowIndex], landmarks[wristIndex], aspectRatio);

    const bodyLine = calculateAngle(landmarks[shoulderIndex], landmarks[hipIndex], landmarks[ankleIndex], aspectRatio);
    if (180 - bodyLine > 20) cue = 'Keep your body in a straight line from shoulders to ankles.';
  } else {
    const [shoulderIndex, elbowIndex, wristIndex, hipIndex] = sideLandmarks;
    angle = calculateAngle(landmarks[shoulderIndex], landmarks[elbowIndex], landmarks[wristIndex], aspectRatio);

    const upperArmAngle = calculateAngle(landmarks[hipIndex], landmarks[shoulderIndex], landmarks[elbowIndex], aspectRatio);
    if (upperArmAngle < 145) cue = 'Keep your upper arm close to your side and avoid swinging.';
  }

  return { angle, cue };
}

export function advanceRepTracker(tracker, angle, exercise) {
  if (exercise === 'headRotation') {
    const config = EXERCISES.headRotation;
    let phase = tracker.phase;
    let reps = tracker.reps;

    if (Math.abs(angle) <= config.centerThreshold) {
      if (phase === 'turned') reps += 1;
      phase = 'center';
    } else if (Math.abs(angle) >= config.turnThreshold) {
      phase = 'turned';
    }

    return { phase, reps };
  }

  const { topAngle, bottomAngle } = EXERCISES[exercise];
  let phase = tracker.phase;
  let reps = tracker.reps;

  if (angle >= topAngle) {
    if (phase === 'bottom') reps += 1;
    phase = 'top';
  } else if (angle <= bottomAngle) {
    phase = 'bottom';
  }

  return { phase, reps };
}

export function getLandmarkVisibility(landmark) {
  return visibility(landmark);
}
