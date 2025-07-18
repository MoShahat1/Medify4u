const mongoose = require('mongoose');
require('dotenv').config();

async function resetDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all collections
    const collections = await mongoose.connection.db.collections();

    // Drop each collection
    for (let collection of collections) {
      await collection.drop();
      console.log(`Dropped collection: ${collection.collectionName}`);
    }

    // Drop all indexes
    const db = mongoose.connection.db;
    const collections2 = await db.listCollections().toArray();
    for (let collection of collections2) {
      await db.collection(collection.name).dropIndexes();
      console.log(`Dropped indexes for collection: ${collection.name}`);
    }

    console.log('Database reset complete');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  }
}

// New script to update all patients with missing required fields
const Patient = require('../models/patient.model');

async function updatePatientsWithDefaults() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const defaultValues = {
      bmi: 22,
      smoking: false,
      alcoholDrinking: false,
      stroke: false,
      physicalHealth: 15,
      mentalHealth: 15,
      diffWalking: false,
      ageCategory: 'adult',
      race: 'other',
      diabetic: 'No',
      physicalActivity: false,
      genHealth: 'Good',
      sleepTime: 8,
      asthma: false,
      kidneyDisease: false,
      skinCancer: false
    };

    const patients = await Patient.find({});
    let updatedCount = 0;
    for (let patient of patients) {
      let updated = false;
      for (let key in defaultValues) {
        if (patient[key] === undefined) {
          patient[key] = defaultValues[key];
          updated = true;
        }
      }
      if (updated) {
        await patient.save();
        updatedCount++;
      }
    }
    console.log(`Updated ${updatedCount} patient(s) with default values.`);
    process.exit(0);
  } catch (error) {
    console.error('Error updating patients:', error);
    process.exit(1);
  }
}

// Only run if this script is called directly
if (require.main === module) {
  updatePatientsWithDefaults();
}

resetDatabase();