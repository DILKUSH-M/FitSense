require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const User = require('../models/User');
const Workout = require('../models/Workout');
const {
  dayKeyAt,
  isValidDayKey,
  isValidTimeZone,
} = require('../utils/calendar');
const {
  DATASET_NAME,
  generateSampleHistory,
  parseFitbitDailyActivityCsv,
  upsertHistoricalActivity,
  upsertHistoricalWorkout,
} = require('../services/historicalFitness');

function optionValue(args, option) {
  const index = args.indexOf(option);
  if (index < 0) return '';
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

async function getDemoUser() {
  const email = (process.env.FITNESS_HISTORY_DEMO_EMAIL || 'history-demo@fitsense.invalid')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.invalid$/.test(email)) {
    throw new Error('FITNESS_HISTORY_DEMO_EMAIL must use the reserved .invalid domain.');
  }

  const timeZone = process.env.FITNESS_HISTORY_TIME_ZONE || 'UTC';
  if (!isValidTimeZone(timeZone)) throw new Error('FITNESS_HISTORY_TIME_ZONE must be a valid IANA time zone.');
  const configuredEndDay = process.env.FITNESS_HISTORY_AS_OF_DAY || '';
  if (configuredEndDay && !isValidDayKey(configuredEndDay)) {
    throw new Error('FITNESS_HISTORY_AS_OF_DAY must be a real YYYY-MM-DD date.');
  }

  let user = await User.findOne({ email });
  if (user) {
    if (!user.isDemoProfile) {
      throw new Error(`Refusing to seed non-demo account ${email}.`);
    }
    if (!user.historySampleEndDay) {
      user.historySampleEndDay = configuredEndDay || dayKeyAt(new Date(), timeZone);
      await user.save();
    }
    if (!isValidDayKey(user.historySampleEndDay)) {
      throw new Error('The demo account has an invalid historical sample end day.');
    }
    return user;
  }

  const password = process.env.FITNESS_HISTORY_DEMO_PASSWORD || crypto.randomBytes(48).toString('hex');
  user = await User.create({
    name: 'FitSense Historical Demo',
    email,
    password: await bcrypt.hash(password, 10),
    isDemoProfile: true,
    historySampleEndDay: configuredEndDay || dayKeyAt(new Date(), timeZone),
    trackingPreferences: { timeZone },
  });
  return user;
}

async function runHistoricalSeed(args = process.argv.slice(2)) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitsense';
  const csvPath = optionValue(args, '--csv') || process.env.FITBIT_DAILY_ACTIVITY_CSV || '';
  const participantId = optionValue(args, '--participant-id') || process.env.FITBIT_PARTICIPANT_ID || '';
  await mongoose.connect(mongoUri);

  try {
    await Promise.all([User.init(), Activity.init(), Workout.init()]);
    const user = await getDemoUser();
    const sample = generateSampleHistory(user.historySampleEndDay, 90);
    const sampleActivityCounts = { created: 0, upgraded: 0, updated: 0, preserved: 0 };
    const sampleWorkoutCounts = { created: 0, preserved: 0 };

    for (const record of sample.activityRecords) {
      const result = await upsertHistoricalActivity(Activity, user._id, record);
      sampleActivityCounts[result] += 1;
    }
    for (const record of sample.workoutRecords) {
      const result = await upsertHistoricalWorkout(Workout, user._id, record);
      sampleWorkoutCounts[result] += 1;
    }

    let publicData = null;
    const publicCounts = { created: 0, upgraded: 0, updated: 0, preserved: 0 };
    if (csvPath) {
      const resolvedCsvPath = path.resolve(csvPath);
      const csvText = await fs.readFile(resolvedCsvPath, 'utf8');
      publicData = parseFitbitDailyActivityCsv(csvText, participantId);
      for (const record of publicData.records) {
        const result = await upsertHistoricalActivity(Activity, user._id, record);
        publicCounts[result] += 1;
      }
    }

    const baselineActivities = await Activity.find({
      user: user._id,
      historicalBaseline: true,
    }).select('source sourceMetadata.metricSources').lean();
    const sampleActivityRecords = baselineActivities.filter((record) => (
      record.source === 'sample_generated'
      || Object.values(record.sourceMetadata?.metricSources || {}).includes('sample_generated')
    )).length;
    const publicActivityRecords = baselineActivities.filter((record) => (
      record.source === 'public_dataset'
      || Object.values(record.sourceMetadata?.metricSources || {}).includes('public_dataset')
    )).length;
    const sampleWorkouts = await Workout.countDocuments({
      user: user._id,
      historicalBaseline: true,
      source: 'sample_generated',
    });

    return {
      demoEmail: user.email,
      sampleEndDayKey: user.historySampleEndDay,
      sampleDaysRequested: sample.activityRecords.length,
      sampleActivityWrites: sampleActivityCounts,
      sampleGeneratedActivityRecords: sampleActivityRecords,
      sampleWorkoutWrites: sampleWorkoutCounts,
      sampleGeneratedWorkoutRecords: sampleWorkouts,
      publicDataset: publicData
        ? {
          name: DATASET_NAME,
          participantId: publicData.participantId,
          coverage: publicData.coverage,
          csvRows: publicData.records.length,
          importedRecords: publicCounts,
          publicDatasetBaselineDays: publicActivityRecords,
        }
        : {
          importedRecords: 0,
          publicDatasetBaselineDays: publicActivityRecords,
          message: 'No CSV imported. Set FITBIT_DAILY_ACTIVITY_CSV or pass --csv to import the public source.',
        },
    };
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runHistoricalSeed()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(`Historical fitness seed failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { getDemoUser, runHistoricalSeed };
