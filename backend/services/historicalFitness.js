const {
  dayKeysEnding,
  isValidDayKey,
  weekStartDayKey,
} = require('../utils/calendar');

const DATASET_NAME = 'FitBit Fitness Tracker Data (Mobius/Kaggle)';
const DATASET_URL = 'https://www.kaggle.com/datasets/arashnic/fitbit';
const GENERATION_VERSION = 'fitsense-history-v1';
const ACTIVITY_FIELDS = [
  'steps',
  'distanceKm',
  'caloriesBurned',
  'activeMinutes',
  'waterIntakeMl',
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text).replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('The Fitbit CSV contains an unterminated quoted field.');
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

function parseDatasetDay(value) {
  const input = String(value || '').trim();
  let dayKey;
  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (usDate) {
    dayKey = `${usDate[3]}-${usDate[1].padStart(2, '0')}-${usDate[2].padStart(2, '0')}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    dayKey = input;
  }
  if (!dayKey || !isValidDayKey(dayKey)) {
    throw new Error(`Invalid Fitbit ActivityDate value: "${input}".`);
  }
  return dayKey;
}

function optionalNumber(value, column, lineNumber) {
  const input = String(value ?? '').trim();
  if (!input) return null;
  const number = Number(input);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Invalid non-negative number in ${column} on CSV line ${lineNumber}.`);
  }
  return number;
}

function parseFitbitDailyActivityCsv(text, participantId = '') {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) throw new Error('The Fitbit daily activity CSV has no data rows.');
  const headers = csvRows[0].map((header) => header.trim().toLowerCase());
  const indexes = new Map(headers.map((header, index) => [header, index]));
  for (const required of ['id', 'activitydate', 'totalsteps', 'calories']) {
    if (!indexes.has(required)) {
      throw new Error(`The Fitbit CSV is missing the required "${required}" column.`);
    }
  }

  const rowsByParticipant = new Map();
  for (let index = 1; index < csvRows.length; index += 1) {
    const cells = csvRows[index];
    const lineNumber = index + 1;
    const get = (column) => indexes.has(column) ? cells[indexes.get(column)] : '';
    const participant = String(get('id')).trim();
    if (!participant) throw new Error(`A Fitbit participant ID is missing on CSV line ${lineNumber}.`);
    const dayKey = parseDatasetDay(get('activitydate'));
    const steps = optionalNumber(get('totalsteps'), 'TotalSteps', lineNumber);
    const calories = optionalNumber(get('calories'), 'Calories', lineNumber);
    if (steps === null || calories === null) {
      throw new Error(`TotalSteps and Calories are required on CSV line ${lineNumber}.`);
    }

    const record = {
      dayKey,
      date: new Date(`${dayKey}T12:00:00.000Z`),
      steps: Math.floor(steps),
      caloriesBurned: Math.floor(calories),
      availableMetrics: ['steps', 'caloriesBurned'],
      source: 'public_dataset',
      historicalBaseline: true,
      sourceMetadata: {
        datasetName: DATASET_NAME,
        datasetUrl: DATASET_URL,
        participantId: participant,
        sourceDate: String(get('activitydate')).trim(),
      },
    };

    const distance = optionalNumber(get('totaldistance'), 'TotalDistance', lineNumber);
    if (distance !== null) {
      record.distanceKm = distance;
      record.availableMetrics.push('distanceKm');
    }

    const activeColumns = [
      ['veryactiveminutes', 'veryActiveMinutes'],
      ['fairlyactiveminutes', 'fairlyActiveMinutes'],
      ['lightlyactiveminutes', 'lightlyActiveMinutes'],
    ];
    const sourceActivity = {};
    let activeMinutes = 0;
    let hasActiveMinutes = false;
    for (const [column, sourceField] of activeColumns) {
      const value = optionalNumber(get(column), column, lineNumber);
      if (value !== null) {
        sourceActivity[sourceField] = value;
        activeMinutes += value;
        hasActiveMinutes = true;
      }
    }
    if (hasActiveMinutes) {
      record.activeMinutes = Math.floor(activeMinutes);
      record.availableMetrics.push('activeMinutes');
    }
    const sedentaryMinutes = optionalNumber(get('sedentaryminutes'), 'SedentaryMinutes', lineNumber);
    if (sedentaryMinutes !== null) sourceActivity.sedentaryMinutes = sedentaryMinutes;
    record.sourceMetadata.sourceActivity = sourceActivity;

    const participantRows = rowsByParticipant.get(participant) || new Map();
    const previous = participantRows.get(dayKey);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) {
      throw new Error(`Conflicting Fitbit rows for participant ${participant} on ${dayKey}.`);
    }
    participantRows.set(dayKey, record);
    rowsByParticipant.set(participant, participantRows);
  }

  const requestedParticipant = String(participantId || '').trim();
  if (rowsByParticipant.size === 0) throw new Error('The Fitbit CSV contains no valid participant records.');
  let selectedId = requestedParticipant;
  if (selectedId && !rowsByParticipant.has(selectedId)) {
    throw new Error(`Fitbit participant ${selectedId} was not found in the CSV.`);
  }
  if (!selectedId) {
    selectedId = [...rowsByParticipant.entries()]
      .sort((left, right) => (
        right[1].size - left[1].size || left[0].localeCompare(right[0], 'en', { numeric: true })
      ))[0][0];
  }

  const records = [...rowsByParticipant.get(selectedId).values()]
    .sort((left, right) => left.dayKey.localeCompare(right.dayKey));
  return {
    datasetName: DATASET_NAME,
    datasetUrl: DATASET_URL,
    participantId: selectedId,
    records,
    coverage: {
      firstDayKey: records[0].dayKey,
      lastDayKey: records[records.length - 1].dayKey,
      days: records.length,
    },
  };
}

function generateSampleHistory(endDayKey, count = 90) {
  const dayKeys = dayKeysEnding(endDayKey, count);
  const stepPattern = [5700, 7600, 6400, 8900, 6100, 10800, 9400];
  const waterPattern = [1750, 2100, 1850, 2300, 1650, 2500, 2200];
  const activePattern = [22, 38, 29, 46, 25, 62, 48];
  const activityRecords = [];
  const workoutRecords = [];

  dayKeys.forEach((dayKey, index) => {
    const weekday = new Date(`${dayKey}T12:00:00.000Z`).getUTCDay();
    const weekVariation = [0, 280, -160, 190][Math.floor(index / 7) % 4];
    const steps = Math.max(2500, stepPattern[weekday] + weekVariation);
    const caloriesBurned = Math.round(1650 + steps * 0.058);
    const distanceKm = Number((steps * 0.0007).toFixed(2));
    activityRecords.push({
      dayKey,
      date: new Date(`${dayKey}T12:00:00.000Z`),
      steps,
      distanceKm,
      caloriesBurned,
      activeMinutes: activePattern[weekday],
      waterIntakeMl: waterPattern[weekday] + (Math.floor(index / 7) % 3) * 100,
      goal: 8000,
      source: 'sample_generated',
      historicalBaseline: true,
      availableMetrics: ACTIVITY_FIELDS,
      sourceMetadata: {
        generationVersion: GENERATION_VERSION,
        generationMethod: 'Fixed day-of-week template with deterministic weekly variation.',
        isSynthetic: true,
        notMeasured: true,
      },
      notes: 'Generated historical sample; not a wearable measurement.',
    });

    if (![1, 3, 5].includes(weekday)) return;
    const weekNumber = Math.floor(index / 7);
    const durationMinutes = [35, 42, 30][weekNumber % 3];
    workoutRecords.push({
      dayKey,
      historyRecordId: `${GENERATION_VERSION}:${dayKey}:workout`,
      exerciseName: ['Sample strength session', 'Sample cardio session', 'Sample mobility session'][weekNumber % 3],
      category: ['Full body', 'Cardio', 'Flexibility'][weekNumber % 3],
      targetMuscleGroup: 'General',
      sets: 3,
      reps: 10,
      weight: 0,
      durationMinutes,
      workoutDate: new Date(`${dayKey}T12:00:00.000Z`),
      source: 'sample_generated',
      historicalBaseline: true,
      sourceMetadata: {
        generationVersion: GENERATION_VERSION,
        generationMethod: 'Fixed Monday/Wednesday/Friday sample schedule.',
        isSynthetic: true,
        notMeasured: true,
      },
      notes: 'Generated historical sample; not an actual workout.',
    });
  });

  return { activityRecords, workoutRecords };
}

async function upsertHistoricalActivity(ActivityModel, userId, record) {
  const filter = { user: userId, dayKey: record.dayKey, historicalBaseline: true };
  const existing = await ActivityModel.findOne(filter).lean();
  if (existing) {
    if (record.source === 'public_dataset') {
      const importedMetrics = new Set(record.availableMetrics || []);
      const existingMetrics = Array.isArray(existing.availableMetrics)
        ? existing.availableMetrics
        : ACTIVITY_FIELDS.filter((field) => existing[field] !== undefined);
      const preservedMetrics = existingMetrics.filter((field) => (
        !importedMetrics.has(field) && existing[field] !== undefined
      ));
      const metricSources = {};
      const metricSourceMetadata = {};
      for (const field of importedMetrics) {
        metricSources[field] = 'public_dataset';
        metricSourceMetadata[field] = record.sourceMetadata;
      }
      for (const field of preservedMetrics) {
        metricSources[field] = existing.sourceMetadata?.metricSources?.[field] || existing.source;
        metricSourceMetadata[field] = existing.sourceMetadata?.metricSourceMetadata?.[field]
          || existing.sourceMetadata;
      }
      const sources = [...new Set(Object.values(metricSources))];
      const mergedRecord = {
        ...record,
        ...Object.fromEntries(preservedMetrics.map((field) => [field, existing[field]])),
        user: userId,
        historicalBaseline: true,
        availableMetrics: [...new Set([...importedMetrics, ...preservedMetrics])],
        source: sources.length > 1 ? 'mixed' : 'public_dataset',
        notes: preservedMetrics.length
          ? 'Some measurements are generated samples; see metric source metadata.'
          : '',
        sourceMetadata: {
          ...record.sourceMetadata,
          ...(preservedMetrics.length
            ? {
              metricSources,
              metricSourceMetadata,
            }
            : {}),
        },
      };
      await ActivityModel.updateOne(
        filter,
        { $set: mergedRecord },
      );
      return existing.source === 'sample_generated' ? 'upgraded' : 'updated';
    }
    return 'preserved';
  }

  try {
    await ActivityModel.create({ ...record, user: userId, historicalBaseline: true });
    return 'created';
  } catch (error) {
    if (error.code === 11000) return 'preserved';
    throw error;
  }
}

async function upsertHistoricalWorkout(WorkoutModel, userId, record) {
  const filter = { user: userId, historyRecordId: record.historyRecordId };
  const existing = await WorkoutModel.findOne(filter).lean();
  if (existing) return 'preserved';
  try {
    await WorkoutModel.create({ ...record, user: userId, historicalBaseline: true });
    return 'created';
  } catch (error) {
    if (error.code === 11000) return 'preserved';
    throw error;
  }
}

module.exports = {
  DATASET_NAME,
  DATASET_URL,
  GENERATION_VERSION,
  generateSampleHistory,
  parseCsv,
  parseFitbitDailyActivityCsv,
  upsertHistoricalActivity,
  upsertHistoricalWorkout,
  weekStartDayKey,
};
