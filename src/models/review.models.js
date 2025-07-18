const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    // required: true
  }
}, {
  timestamps: true
});

// Ensure one review per doctor-patient combination
reviewSchema.index({ doctorId: 1, patientId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema, 'reviews');