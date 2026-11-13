import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceRepTracker,
  analyzeExercisePose,
  assessFraming,
  calculateAngle,
} from './postureAnalysis.js';

function visiblePose() {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  landmarks[0] = { x: 0.5, y: 0.08, visibility: 0.9 };
  landmarks[11] = { x: 0.46, y: 0.2, visibility: 0.9 };
  landmarks[23] = { x: 0.46, y: 0.5, visibility: 0.9 };
  landmarks[25] = { x: 0.46, y: 0.7, visibility: 0.9 };
  landmarks[27] = { x: 0.46, y: 0.92, visibility: 0.9 };
  return landmarks;
}

function visibleHeadPose() {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  landmarks[0] = { x: 0.5, y: 0.08, visibility: 0.9 };
  landmarks[11] = { x: 0.4, y: 0.4, visibility: 0.9 };
  landmarks[12] = { x: 0.6, y: 0.4, visibility: 0.9 };
  return landmarks;
}

test('calculateAngle adjusts for the camera image aspect ratio', () => {
  const angle = calculateAngle(
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    2,
  );
  assert.equal(Math.round(angle), 63);
});

test('framing assessment identifies missing exercise landmarks before analysis', () => {
  const pose = visiblePose();
  pose[27].visibility = 0.1;

  const assessment = assessFraming(pose, 'squat');
  assert.equal(assessment.ready, false);
  assert.match(assessment.message, /ankle/);
});

test('framing assessment asks the user to enter view when no pose is detected', () => {
  const assessment = assessFraming(undefined, 'squat');
  assert.equal(assessment.ready, false);
  assert.match(assessment.message, /Step into view/);
});

test('framing assessment accepts a visible, in-frame squat pose', () => {
  const assessment = assessFraming(visiblePose(), 'squat');
  assert.equal(assessment.ready, true);
  assert.equal(assessment.side, 'left');
});

test('framing assessment asks for a side view when the torso looks front-on', () => {
  const pose = visiblePose();
  pose[11] = { x: 0.3, y: 0.2, visibility: 0.9 };
  pose[12] = { x: 0.7, y: 0.2, visibility: 0.9 };
  pose[23] = { x: 0.35, y: 0.5, visibility: 0.9 };
  pose[24] = { x: 0.65, y: 0.5, visibility: 0.9 };
  pose[25] = { x: 0.35, y: 0.7, visibility: 0.9 };
  pose[26] = { x: 0.65, y: 0.7, visibility: 0.9 };
  pose[27] = { x: 0.35, y: 0.92, visibility: 0.9 };
  pose[28] = { x: 0.65, y: 0.92, visibility: 0.9 };

  const assessment = assessFraming(pose, 'squat');
  assert.equal(assessment.ready, false);
  assert.match(assessment.message, /too front-on/);
});

test('head rotation framing accepts a front-facing head-and-shoulders view', () => {
  const assessment = assessFraming(visibleHeadPose(), 'headRotation');
  assert.equal(assessment.ready, true);
  assert.equal(assessment.side, 'left');
});

test('head rotation uses nose offset and counts a turn after returning to center', () => {
  const pose = visibleHeadPose();
  pose[0].x = 0.54;
  const metrics = analyzeExercisePose(pose, 'headRotation', 'left', 16 / 9);
  assert.ok(metrics.angle > 0.12);
  assert.match(metrics.cue, /Return your head/);

  let tracker = advanceRepTracker({ phase: 'waiting', reps: 0 }, 0, 'headRotation');
  tracker = advanceRepTracker(tracker, metrics.angle, 'headRotation');
  tracker = advanceRepTracker(tracker, 0, 'headRotation');
  assert.deepEqual(tracker, { phase: 'center', reps: 1 });
});

test('repetition tracker counts a complete movement once', () => {
  let tracker = { phase: 'waiting', reps: 0 };
  tracker = advanceRepTracker(tracker, 170, 'squat');
  tracker = advanceRepTracker(tracker, 100, 'squat');
  tracker = advanceRepTracker(tracker, 170, 'squat');
  assert.deepEqual(tracker, { phase: 'top', reps: 1 });
  assert.deepEqual(advanceRepTracker(tracker, 170, 'squat'), tracker);
});
