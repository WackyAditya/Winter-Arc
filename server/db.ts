import mongoose from 'mongoose';

export async function connectMongo(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.log('ℹ️ No MONGODB_URI found in .env; using local JSON database.');
    return false;
  }

  if (uri.includes('yourdomain.mongodb.net') || uri.includes('<') || uri.includes('>')) {
    console.warn('⚠️ MONGODB_URI in .env still contains placeholder text (e.g. "yourdomain.mongodb.net").');
    console.warn('   Please replace "yourdomain" with your real MongoDB Atlas cluster ID.');
    return false;
  }

  try {
    console.log('🔄 Attempting to connect to MongoDB Atlas...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected successfully to MongoDB Database:', mongoose.connection.name);
    return true;
  } catch (err: any) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    console.log('ℹ️ Falling back to local JSON file storage.');
    return false;
  }
}

// Schemas & Models
const HabitSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, default: 'Routine' },
  target: { type: String },
  defaultTime: { type: String },
  createdAt: { type: String },
  updatedAt: { type: String },
});

const AppStateSchema = new mongoose.Schema({
  key: { type: String, default: 'global_state', unique: true },
  habits: [HabitSchema],
  history: { type: mongoose.Schema.Types.Mixed, default: {} },
  soundEnabled: { type: Boolean, default: true },
  monkMode: { type: Boolean, default: false },
  lastUpdated: { type: String },
});

export const HabitModel = mongoose.models.Habit || mongoose.model('Habit', HabitSchema);
export const AppStateModel = mongoose.models.AppState || mongoose.model('AppState', AppStateSchema);
