const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  rationale: [{ type: String }],
  workoutType: { type: String, default: 'General fitness' },
  alternatives: [{ type: String }],
  accepted: { type: Boolean, default: false },
  feedback: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  selectedOption: { type: String, default: '' },
  reasonScore: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Recommendation', recommendationSchema);
