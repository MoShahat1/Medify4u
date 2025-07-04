const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const patientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  gender: {
    type: String,
    required: true,
    enum: ['male', 'female']
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  height: Number,
  weight: Number,
  chronicCondition: String,
  diabetes: {
    type: Boolean,
    default: false
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
},
  heartRate: Number,
  bmi: { type: Number, required: true },
  resetToken: String,
  otp: {
    code: String,
    expiresAt: Date
  },
  medicalHistory: [{
    type: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    description: String,
    diagnosis: String,
    treatment: String,
    attachments: [String],
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true
    }
  }],
  favoriteDoctors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  }],
  smoking: { type: Boolean, default: false,required: true },
  alcoholDrinking: { type: Boolean, default: false,required: true },
  stroke: { type: Boolean, default: false,required: true },
  physicalHealth: { type: Number, min: 0, max: 30,required: true },
  mentalHealth: { type: Number, min: 0, max: 30,required: true },
  diffWalking: { type: Boolean, default: false,required: true },
  ageCategory: { type: String, required: true },
  race: { type: String, required: true }, 
  diabetic: { type: String, enum: ['Yes', 'No', 'Borderline diabetes'],required: true },
  physicalActivity: { type: Boolean, default: false,required: true },
  genHealth: { type: String, enum: ['Excellent', 'Very good', 'Good', 'Fair', 'Poor'],required: true },
  sleepTime: { type: Number, min: 0, max: 24,required: true },
  asthma: { type: Boolean, default: false,required: true },
  kidneyDisease: { type: Boolean, default: false,required: true },
  skinCancer: { type: Boolean, default: false,required: true }
}, {
  timestamps: true
});

patientSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

patientSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Patient', patientSchema, 'patients');